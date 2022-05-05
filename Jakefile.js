const fs = require('fs');

const glob = require('glob');
const ts = require('typescript');
const toml = require('toml');
const { rollup } = require('rollup');
const { minify: minifyHtml } = require('html-minifier');
const { minify: minifyJs } = require('terser');
const esprima = require('esprima');
const escodegen = require('escodegen');

const typescriptModule = require('./src/jake/typescript-module');
const version = require('./src/jake/version');

console.log('poppyio.js ' + version);

const outputDirectories = [].concat(
	'target',
	glob.sync('src/modules/**/').map(name => name.replace('src/modules/','target/package/')),
	glob.sync('src/modules/**/').map(name => name.replace('src/modules/','target/package/amd/')),
	glob.sync('src/modules/**/').map(name => name.replace('src/modules/','target/package/cjs/')),
	'target/package/bundle'
);
outputDirectories.forEach(directory);

const typescriptModuleNames = (glob.sync('src/modules/**/*.ts')
	.filter(name => name.indexOf('$') === -1 && !name.endsWith('.d.ts'))
	.map(name => name.replace('.ts', '').replace('src/modules/','')));

const translationTags = glob.sync('src/strings/*.toml')
	.map(name => name.replace('src/strings/', '').replace('.toml', ''));

const moduleNames = [].concat(
	typescriptModuleNames,
	translationTags.map(tag => 'inject-' + tag),
	'injected-launcher-html'
);

task('clean', () => jake.rmRf('target'));
task('rebuild', ['clean', 'default']);
task('default', [].concat(
	outputDirectories,
	moduleNames.map(name => `target/package/${name}.js`),
	// Also emits CommonJS in /cjs/
	moduleNames.map(name => `target/package/amd/${name}.js`), 
	// Also emits minified version
	'target/package/bundle/poppyio.js',
	translationTags.map(tag => `target/package/bundle/poppyio.inject-${tag}.js`),
	// Also emits minified version
	translationTags.map(tag => `target/package/bundle/poppyio.${tag}.js`),
	'target/package/package.json',
	'target/package/README.md'
));

// Compile TypeScript modules into ES6 modules
for (let name of typescriptModuleNames) {
	// Generate ES6 .mjs Module from TypeScript source
	typescriptModule(`target/package/${name}.js`, [`src/modules/${name}.ts`]);
}

// Convert translations into ES6 modules
for (let tag of translationTags) {
	// Standalone inject-[lang].js
	file(`target/package/inject-${tag}.js`, [`src/strings/${tag}.toml`], () => {
		console.log('[strings] ' + 'inject-' + tag + '.js');
		let object = toml.parse(fs.readFileSync(`src/strings/${tag}.toml`, 'utf-8'));
		fs.writeFileSync(`target/package/inject-${tag}.js`, 'import Injected from "./injected.js";\nInjected.add(' + JSON.stringify(object, undefined, 2) + ');\n');
		fs.writeFileSync(`target/package/inject-${tag}.d.ts`, '// This module only is only imported for its side effects\n');
	});
}

// Convert HTML template into ES6 module
file('target/package/injected-launcher-html.js', ['src/injected-launcher.html'], () => {
	console.log('[injected.launcher.html]');
	let html = fs.readFileSync('src/injected-launcher.html', 'utf-8');
	let minified = minifyHtml(html, {
		removeAttributeQuotes: true,
		collapseWhitespace: true
	});
	fs.writeFileSync('target/package/injected-launcher-html.js', `export const HTML = ${JSON.stringify(minified)};`);
});

// All ES6 modules -> ES5 modules
for (let moduleName of moduleNames) {
	file(`target/package/amd/${moduleName}.js`, [`target/package/${moduleName}.js`], () => {
		console.log('[625] ' + moduleName + '.js');
		// Remove .js from ES6 import paths before converting to CommonJS and AMD
		let original = fs.readFileSync(`target/package/${moduleName}.js`, 'utf-8');
		let parsed = esprima.parseModule(original, {range: true, tokens: true, comment: true});
		parsed.body.forEach(node => {
			if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportAllDeclaration')
				return;
			if (!node.source || !node.source.value) {
				return;
			}
			node.source.value = node.source.value.replace(/\.js$/,'');
		});
		parsed = escodegen.attachComments(parsed, parsed.comments, parsed.tokens);
		let es6 = escodegen.generate(parsed, {
			comment: true
		});
		// Convert to ES5 modules
		let cjs = ts.transpileModule(es6, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
		fs.writeFileSync(`target/package/cjs/${moduleName}.js`, cjs);
		let amd = ts.transpileModule(es6, { compilerOptions: { module: ts.ModuleKind.AMD } }).outputText;
		fs.writeFileSync(`target/package/amd/${moduleName}.js`, amd);
	});
}

// Base bundle
const promisePolyfillLocation = require.resolve('promiscuous/dist/promiscuous-browser.js');
const promisePolyfillCode = fs.readFileSync(promisePolyfillLocation, 'utf-8');
file('target/package/bundle/poppyio.js', typescriptModuleNames.map(name => 'target/package/' + name + '.js').concat('target/package/injected-launcher-html.js'), async () => {
	console.log('[bundle] poppyio.js');
	let rolledUp = await rollup({
		input: 'target/package/poppyio.js'
	});
	let { output } = await rolledUp.generate({
		format: 'iife',
		name: 'poppyio',
		outro: `
			var Promise = window.Promise;
			if (typeof Promise !== 'function') {
				${promisePolyfillCode}
			}
			exports.Promise = Promise;
		`
	});
	let es5 = ts.transpileModule(output[0].code, {
		compilerOptions: {
			module: ts.ModuleKind.None,
			noEmitHelpers: true
		}
	}).outputText;
	fs.writeFileSync('target/package/bundle/poppyio.js', es5);
	let minified = await minifyJs(es5);
	fs.writeFileSync('target/package/bundle/poppyio.min.js', minified.code);
});

// Bundle scripts with translated strings
for (let tag of translationTags) {
	// Standalone inject-[tag].js
	file(`target/package/bundle/poppyio.inject-${tag}.js`,[`src/strings/${tag}.toml`], async () => {
		console.log('[strings] ' + 'bundle/poppyio.inject-' + tag + '.js');
		let object = toml.parse(fs.readFileSync(`src/strings/${tag}.toml`, 'utf-8'));
		let code = (await minifyJs(`poppyio.Injected.add(${JSON.stringify(object)})`)).code;
		fs.writeFileSync(`target/package/bundle/poppyio.inject-${tag}.js`, code);
	});
	// Base bundle + inject-[tag].js
	file(`target/package/bundle/poppyio.${tag}.js`,[`target/package/bundle/poppyio.inject-${tag}.js`, 'target/package/bundle/poppyio.js'], async () => {
		console.log('[complete-bundle] ' + 'bundle/poppyio.' + tag + '.js');
		let inject = fs.readFileSync(`target/package/bundle/poppyio.inject-${tag}.js`, 'utf-8');
		fs.writeFileSync(`target/package/bundle/poppyio.${tag}.js`, fs.readFileSync('target/package/bundle/poppyio.js', 'utf-8') + inject);
		fs.writeFileSync(`target/package/bundle/poppyio.${tag}.min.js`, fs.readFileSync('target/package/bundle/poppyio.min.js', 'utf-8') + inject);
	});
}

// package.json
file('target/package/package.json', ['package.json', 'target/package/cjs'], () => {
	console.log('[package.json]');
	const name = 'poppyio';
	const description = 'Poppy I/O Library'
	const homepage = 'https://poppy.io'
	fs.writeFileSync('target/package/package.json', JSON.stringify({ main: 'poppyio.js', name, version, description, homepage, type: 'module' }, undefined, 2));
	fs.writeFileSync('target/package/cjs/package.json', JSON.stringify({ main: 'poppyio.js', type: 'commonjs' }, undefined, 2));
	fs.writeFileSync('target/package/bower.json', JSON.stringify({ name, description, homepage }, undefined, 2));
});

// README.md
file('target/package/README.md', ['target/package', 'README.md'], () => {
	console.log('[README]');
	fs.copyFileSync('README.md', 'target/package/README.md');
});

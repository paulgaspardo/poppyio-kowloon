// The TypeScript compiler
// based on https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API

const fs = require('fs');
const path = require('path');

const ts = require('typescript');

const version = require('./version');

const files = {};

function typescriptTask (output, inputs, transform) {
	files[inputs[0]] = 0;
	return file(output, inputs, () => {
		compileTypescript(inputs[0], transform);
	});
}
module.exports = typescriptTask;

const languageService = ts.createLanguageService({
	getScriptFileNames: () => Object.keys(files),
	getScriptVersion: (name) => files[name] && files[name].toString(),
	getScriptSnapshot: (name) => {
		if (!fs.existsSync(name)) return undefined;
		let contents = fs.readFileSync(name, 'utf-8');
		return ts.ScriptSnapshot.fromString(contents);
	},
	getCurrentDirectory: () => process.cwd(),
	getCompilationSettings: () => {
		const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf-8'));
		const { options } = ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions, process.cwd());
		return options;
	},
	getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
	fileExists: ts.sys.fileExists,
	readFile: ts.sys.readFile,
	readDirectory: ts.sys.readDirectory
}, ts.createDocumentRegistry());

function compileTypescript(fileName, transform) {
	console.log(`[typescript] ${fileName}`);
	files[fileName]++;
	let output = languageService.getEmitOutput(fileName);
	if (output.emitSkipped) {
		console.error(`   error: emitting ${fileName} failed`);
	}
	let allDiagnostics = languageService.getCompilerOptionsDiagnostics()
		.concat(languageService.getSyntacticDiagnostics(fileName))
		.concat(languageService.getSemanticDiagnostics(fileName));
	allDiagnostics.forEach(diagnostic => {
		let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
		if (diagnostic.file) {
			let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
			console.error(`  error: ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
		}
		else {
			console.error(`  error: ${message}`);
		}
	});
	output.outputFiles.forEach(o => {
		let name = o.name;
		let output = o.text;
		if (transform) {
			output = transform(name, output) || output;
		}
		if (output.indexOf('$Version$') !== -1) {
			output = output.replace(/\$Version\$/g, version);
		}
		fs.writeFileSync(name, output);
	});
}

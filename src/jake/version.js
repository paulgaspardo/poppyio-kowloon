const fs = require('fs');
const semver = require('semver');
const animals = require('random-animal-name-generator/animals.json');

var version;
let fromPackage = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version;
let fromEnvironment = process.env.POPPYIO_BUILD_VERSION;
if (!fromEnvironment) {
	let prerelease = semver.prerelease(fromPackage);
	if (prerelease && prerelease.length === 1 && prerelease[0] === 'target') {
		version = `${semver.major(fromPackage)}.${semver.minor(fromPackage)}.${semver.patch(fromPackage)}-${new Date().toISOString().replace(/[^0-9]/g,'')}.${animals[Math.floor(Math.random() * animals.length)]}`;
	} else {
		version = fromPackage;
	}
} else {
	for (let fun of ['major', 'minor', 'patch']) {
		if (semver[fun](fromEnvironment) !== semver[fun](fromPackage)) {
			throw new Error(`package.json version ${fromPackage} not compatible with POPPYIO_BUILD_VERSION ${fromEnvironment}`);
		}
	}
	version = fromEnvironment;
}

module.exports = version;

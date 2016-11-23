#!/usr/bin/env node
const fs = require('fs-promise');
const path = require('path');
const jsdoc2md = require('jsdoc-to-markdown');
const Documentation = require('./documentation');
const config = require('./config');

const mainPromises = [null, null];

// Parse the JSDocs in all source directories
console.log('Parsing JSDocs in source files...');
const files = [];
for(const dir of config.source) files.push(`${dir}/*.js`, `${dir}/**/*.js`);
mainPromises[0] = jsdoc2md.getTemplateData({ files });

// Load the custom docs
if(config.custom) {
	console.log('Loading custom docs files...');
	const customDir = path.dirname(config.custom);

	// Figure out what type of definitions file we're loading
	let type;
	const defExtension = path.extname(config.custom).toLowerCase();
	if(defExtension === '.json') type = 'json';
	else if(defExtension === '.yml' || defExtension === '.yaml') type = 'yaml';
	else throw new TypeError('Unknown custom docs definition file type.');

	mainPromises[1] = fs.readFile(config.custom, 'utf-8').then(defContent => {
		// Parse the definition file
		let definitions;
		if(type === 'json') definitions = JSON.parse(defContent);
		else definitions = require('js-yaml').safeLoad(defContent);

		const custom = {};
		const filePromises = [];

		for(const category of definitions) {
			// Add the category to the custom docs
			const catID = category.catID || category.path || category.name.toLowerCase();
			const dir = path.join(customDir, category.path || catID);
			custom[catID] = [];

			// Add every file in the category
			for(const file of category.files) {
				filePromises.push(fs.readFile(path.join(dir, file.path), 'utf-8').then(content => {
					const extension = path.extname(file.path);
					const fileID = file.id || path.basename(file.path, extension);
					custom[catID].push({
						id: fileID,
						name: file.name,
						type: extension.replace(/^\./, ''),
						content
					});
					if(config.verbose) console.log(`Loaded custom docs file ${catID}/${fileID}`);
				}));
			}
		}

		return Promise.all(filePromises).then(() => custom);
	});
}

Promise.all(mainPromises).then(results => {
	const data = results[0];
	const custom = results[1];

	console.log(`${data.length} JSDoc items found.`);
	const fileCount = Object.keys(custom).map(k => custom[k]).reduce((prev, c) => prev + c.length, 0);
	const categoryCount = Object.keys(custom).length;
	console.log(
		`${fileCount} custom doc${fileCount !== 1 ? 's' : ''} files found in ` +
		`${categoryCount} categor${categoryCount !== 1 ? 'ies' : 'y'}.`
	);

	console.log(`Serializing documentation with format version ${Documentation.FORMAT_VERSION}...`);
	const docs = new Documentation(data, custom);
	let output = JSON.stringify(docs.serialize(), null, config.spaces);

	if(config.compress) {
		console.log('Compressing...');
		output = require('zlib').deflateSync(output).toString('utf8');
	}

	if(config.output) {
		console.log(`Writing to ${config.output}...`);
		fs.writeFileSync(config.output, output);
	}

	console.log('Done!');
	process.exit(0);
}).catch(console.error);

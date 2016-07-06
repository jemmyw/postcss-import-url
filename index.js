var postcss = require("postcss");
var phpfn = require("phpfn");
var hh = require("http-https");
var isUrl = require("is-url");
var trim = phpfn("trim"); // TODO: replace by lodash
var resolveRelative = require("resolve-relative-url");

var space = postcss.list.space;

module.exports = postcss.plugin("postcss-import-url", postcssImportUrl);

// var resolveRelative = require('resolve-relative-url');

function postcssImportUrl(options) {
	options = options || {};
	return function importUrl(tree, dummy, parentRemoteFile) {
		var imports = [];
		tree.walkAtRules("import", function checkAtRule(atRule) {
			var params = space(atRule.params);
			var remoteFile = cleanupRemoteFile(params[0]);
			if (parentRemoteFile) {
				remoteFile = resolveRelative(remoteFile, parentRemoteFile);
			}
			if (!isUrl(remoteFile)) return;
			imports[imports.length] = createPromise(remoteFile).then(function(r) {
				var newNode = postcss.parse(r.body);
				var mediaQueries = params.slice(1).join(" ");
				if (mediaQueries) {
					var mediaNode = postcss.atRule({
						name: "media",
						params: mediaQueries
					});
					mediaNode.append(newNode);
					newNode = mediaNode;
				}
				var p = (options.recurse) ? importUrl(newNode, null, r.parent) : Promise.resolve(newNode);
				return p.then(function(tree) {
					atRule.replaceWith(tree);
				});
			});
		});
		return Promise.all(imports).then(function() {
			return tree;
		});
	};
}

function cleanupRemoteFile(value) {
	if (value.substr(0, 3) === "url") {
		value = value.substr(3);
	}
	value = trim(value, "'\"()");
	return value;
}

function createPromise(remoteFile) {
	function executor(resolve, reject) {
		var request = hh.get(remoteFile, function(response) {
			var body = "";
			response.on("data", function(chunk) {
				body += chunk.toString();
			});
			response.on("end", function() {
				resolve({
					body: body,
					parent: remoteFile
				});
			});
		});
		request.on("error", reject);
		request.end();
	}
	return new Promise(executor);
}
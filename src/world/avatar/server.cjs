var http = require('http');
var fs = require('fs');
var index = fs.readFileSync('avatar.glb');

http.createServer(function (req, res) {
	res.writeHead(200, {
		'Content-Type': 'text/plain',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
	});
	  res.end(index);
}).listen(9615);
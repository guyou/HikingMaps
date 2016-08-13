var PORT = 8080;
var BASE = "www";

var http = require('http');
var fs = require('fs');
var path = require('path');

var server = http.createServer(function(request, response) {
	var filePath = BASE + request.url;
	if (request.url == '/')
		filePath += 'index.html';
		
        console.log("Serving " + filePath);

	var extname = path.extname(filePath);
	var contentType = 'text/html';
	switch (extname) {
		case '.js':
			contentType = 'text/javascript';
			break;
		case '.css':
			contentType = 'text/css';
			break;
	}
	
	fs.access(filePath, function(err) {
		if (!err) {
			fs.readFile(filePath, function(error, content) {
				if (error) {
					response.writeHead(500);
					response.end();
				}
				else {
					response.writeHead(200, { 'Content-Type': contentType });
					response.end(content, 'utf-8');
					console.log(filePath + " sent.");
				}
			});
		}
		else {
			response.writeHead(404);
			response.end();
			console.log("404 File not found " + filePath);
		}
	});
});
server.listen(PORT);
console.log('Server running on ' + PORT);

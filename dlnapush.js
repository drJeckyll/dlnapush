#!/bin/env node

var path = require('path')

var address = require('network-address')

var http = require('http')
var fs = require('fs')
var rangeParser = require('range-parser')
var xtend = require('xtend')
var mime = require('mime')
var url = require('url')
var pump = require('pump')

var Browser = require('nodecast-js');
var Client = require('upnp-mediarenderer-client');
var xmlb = require('xmlbuilder');

var nodecast = new Browser()

var host = address();
var port = '8888';
var href = 'http://' + host + ':' + port + '/';

var cl = null

if (process.argv[2] == undefined) {
	console.log("\nSpecify filename to play on DLNA device. Optionally supply subs file as second argument.\n");
	process.exit(0);
}
var filename = process.argv[2];
var subs = process.argv[3];

var truthy = function () {
  return true
}

var createServer = function (filename) {
  var server = http.createServer()
  var getType = mime.lookup.bind(mime)

  server.on('request', function (request, response) {
	var u = url.parse(request.url)
	var host = request.headers.host || 'localhost'

	var file = {
		name: path.dirname(filename) + '/' + path.basename(u.pathname),
		length: fs.statSync(path.dirname(filename) + '/' + path.basename(u.pathname))["size"]
	}

	if (path.extname(u.pathname).toLowerCase() == ".srt") {
		response.statusCode = 200
		response.setHeader('Connection', 'close')
		response.setHeader('Content-Length', file.length)
		if (request.method === 'HEAD') return response.end()
		pump(fs.createReadStream(file.name), response)
		return
	}

    var range = request.headers.range
    range = range && rangeParser(file.length, range)[0]
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Content-Type', getType(file.name))
    response.setHeader('transferMode.dlna.org', 'Streaming')
	if (subs)
    	response.setHeader('CaptionInfo.sec', href + path.basename(subs))
    response.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000')
	if (!range) {
		response.setHeader('Content-Length', file.length)
		if (request.method === 'HEAD') return response.end()
		pump(fs.createReadStream(file.name), response)
		return
	}

	response.statusCode = 206
	response.setHeader('Content-Length', range.end - range.start + 1)
	response.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length)
	if (request.method === 'HEAD') return response.end()
	pump(fs.createReadStream(file.name, {start: range.start, end: range.end}), response)
  })

  //server.on('connection', function (socket) {
  //  socket.setTimeout(36000000)
  //})

  return server
}

var s = createServer(filename)
s.listen(port)

nodecast.onDevice(function (device) {
	console.log("\nFound device: " + device.name + " on IP: " + device.host + " [" + device.xml + "], Type: " + device.type);

	device.onError(function (err) {
		throw err
	})

	cl = new Client(device.xml);
	cl.load(href + path.basename(filename), {
		autoplay: true,
		metadata: {
			type: 'video', // can be 'video', 'audio' or 'image'
			title: path.basename(filename),
			creator: path.basename(filename),
			subtitlesUrl: (subs ? href + path.basename(subs) : "")
		}
	}, function (err, result) {
		if (err) throw err
		console.log("\nPlaying: " + path.basename(filename) + "\n")
	})

	cl.on('stopped', function() {
		process.exit()
	});
})

nodecast.start()

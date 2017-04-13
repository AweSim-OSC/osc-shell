// Set dotenv as early as possible
require('dotenv').config();

var http      = require('http');
var path      = require('path');
var WebSocket = require('ws');
var express   = require('express');
var pty       = require('node-pty');
var hbs       = require('hbs');
var port      = 3000;

// Create all your routes
var router = express.Router();
router.get('/', function (req, res) {
  res.redirect(req.baseUrl + '/ssh');
});
router.get('/ssh*', function (req, res) {
  res.render('index', { baseURI: req.baseUrl });
});
router.use(express.static(path.join(__dirname, 'public')));

// Setup app
var app = express();

// Setup template engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Mount the routes at the base URI
app.use(process.env.PASSENGER_BASE_URI || '/', router);

// Setup websocket server
var server = new http.createServer(app);
var wss = new WebSocket.Server({ server: server });

wss.on('connection', function connection (ws) {
  var match;
  var host = process.env.DEFAULT_SSHHOST || 'localhost';
  var dir;
  var term;
  var args;

  console.log('Connection established');

  // Determine host and dir from request URL
  if (match = ws.upgradeReq.url.match(process.env.PASSENGER_BASE_URI + '/ssh/([^\\/]+)(.+)?$')) {
    if (match[1] !== 'default') host = match[1];
    if (match[2]) dir = unescape(match[2]).replace(/\'/g, "'\\''"); // POSIX escape dir
  }

  process.env.LANG = 'en_US.UTF-8'; // fix for character issues

  args = dir ? [host, '-t', 'cd \'' + dir + '\' ; exec ${SHELL} -l'] : [host];
  term = pty.spawn('ssh', args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
  });

  console.log('Opened terminal: ' + term.pid);

  term.on('data', function (data) {
    ws.send(data, function (error) {
      if (error) console.log('Send error: ' + error.message);
    });
  });

  ws.on('message', function (msg) {
    msg = JSON.parse(msg);
    if (msg.input)  term.write(msg.input);
    if (msg.resize) term.resize(parseInt(msg.resize.cols), parseInt(msg.resize.rows));
  });

  ws.on('close', function () {
    term.end();
    console.log('Closed terminal: ' + term.pid);
  });
});

server.listen(port, function () {
  console.log('Listening on ' + port);
});

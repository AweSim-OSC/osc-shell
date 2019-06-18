
// Object that defines a terminal element
function OodShell(element, url, prefs) {
  this.element = element;
  this.url     = url;
  this.prefs   = prefs || {};
  this.socket  = null;
  this.term    = null;
}

/**
 * Create the terminal. The constructor for the OodShell class is mostly just a data object. This function
 * does the actual work of initializing the hterm.Terminal, the websocket (through a callback *after* the 
 * terminal is ready.) and setting preferences, etc.
 */
OodShell.prototype.createTerminal = function () {
  // Set backing store that hterm uses to read/write preferences
  hterm.defaultStorage = new lib.Storage.Memory();
  
  // Create an instance of hterm.Terminal
  this.term = new hterm.Terminal();
    
  var that = this;
    
  // Handler that fires when terminal is initialized and ready for use
  this.term.onTerminalReady = function () {
    // Create a new terminal IO object and give it the foreground.
    // (The default IO object just prints warning messages about unhandled
    // things to the JS console.)
    var io = this.io.push();
  
    // Set up event handlers for io
    io.onVTKeystroke    = that.onVTKeystroke.bind(that);
    io.sendString       = that.sendString.bind(that);
    io.onTerminalResize = that.onTerminalResize.bind(that);
    
    that.socket = new WebSocket(that.url);  // WS isn't made or bound until terminal is ready
    that.socket.onopen    = that.useCachedSize.bind(that); //we've been caching the term size while connecting
    that.socket.onmessage = that.getMessage.bind(that);
    that.socket.onclose   = that.closeTerminal.bind(that);
    
    // Capture all keyboard input
    this.installKeyboard();
  };
    
  // Patch cursor setting
  this.term.options_.cursorVisible = true;
    
  // Connect terminal to sacrificial DOM node
  this.term.decorate(this.element);
    
  // Set preferences for terminal
  for (var k in this.prefs) {
    this.term.prefs_.set(k, this.prefs[k]);
  }
    
  // Warn user if he/she unloads page
  window.onbeforeunload = function() {
    return 'Leaving this page will terminate your terminal session.';
  };
};

OodShell.prototype.getMessage = function (ev) {
  this.term.io.print(ev.data);
}

OodShell.prototype.closeTerminal = function (ev) {
  var errorDiv;

  // Do not need to warn user if he/she unloads page
  window.onbeforeunload = null;

  // Inform user they lost connection
  if ( this.term === null ) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = 'Failed to establish a websocket connection. Be sure you are using a browser that supports websocket connections.';
    this.element.appendChild(errorDiv);
  } else {
    this.term.io.print('\r\nYour connection to the remote server has been terminated.');
  }
}

OodShell.prototype.onVTKeystroke = function (str) {
  // Do something useful with str here.
  // For example, Secure Shell forwards the string onto the NaCl plugin.
  this.socket.send(JSON.stringify({
    input: str
  }));
};

OodShell.prototype.sendString = function (str) {
  // Just like a keystroke, except str was generated by the
  // terminal itself.
  // Most likely you'll do the same this as onVTKeystroke.
  this.onVTKeystroke(str)
};

OodShell.prototype.onTerminalResize = function (columns, rows) {
  // React to size changes here.
  // Secure Shell pokes at NaCl, which eventually results in
  // some ioctls on the host.
  
  // iff the socket is ready. race condition in FF where we try to resize before the socket is open
  if(this.socket.readyState == 1){ 
    this.socket.send(JSON.stringify({
      resize: {
        cols: columns,
        rows: rows
      }
    }));
  }else{
      this.cachedCols = columns;
      this.cachedRows = rows;
  }

};

OodShell.prototype.useCachedSize = function() {
  if(this.cachedCols && this.cachedRows) {
    this.onTerminalResize(this.cachedCols, this.cachedRows);
  }
};

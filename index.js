var Connection = require('ssh2');
var net = require('net');
var q = require('q');


function SSHTunnel(config, callback) {
    var self = this;
    self._verbose = config.verbose || false;
    self._config = config;
    if (callback) {
        self.connect(callback);
    }
}

SSHTunnel.prototype.log = function () {
    if (this._verbose) {
        console.log.apply(null, arguments);
    }
};

SSHTunnel.prototype.close = function (callback) {
    var self = this;
    this.server.close(function (error) {
        self.connection.end();
        if (callback) {
            callback(error);
        }
    });
};

SSHTunnel.prototype.connect = function () {
    var self = this,
        disabled = self._config.disabled,
        remoteHost = self._config.remoteHost || '127.0.0.1',
        remotePort = self._config.remotePort,
        localPort = self._config.localPort,
        defer = q.defer();


    if (disabled) {
        return q.reject();
    }
    var c = self.connection = new Connection();

    c.on('ready', function () {

        self.server = net.createServer(function (connection) {
            var buffers = [];

            var addBuffer = function (data) {
                buffers.push(data);
            };

            connection.on('data', addBuffer);

            c.forwardOut('', 0, remoteHost, remotePort, function (error, ssh) {
                if (error) throw error;

                while (buffers.length) {
                    ssh.write(buffers.shift());
                }
                connection.removeListener('data', addBuffer);

                ssh.on('data', function (buf) {
                    connection.write(buf);
                });
                connection.on('data', function (buf) {
                    ssh.write(buf);
                });
                connection.on('end', function () {
                    self.log('connection::end');
                    ssh.removeAllListeners();
                    ssh.end();
                });
                ssh.on('end', function () {
                    self.log('ssh::end');
                    connection.removeAllListeners();
                    connection.end();
                });
            });
        });
        self.server.listen(localPort, function() {
            defer.resolve(self.server.address());
        });
    });

    c.on('error', function (err) {
        defer.reject(err);
        self.log('ssh2::error:: ' + err);
    });
    c.on('end', function () {
        self.log('ssh2::end');
    });
    c.on('close', function (err) {
        self.log('ssh2::close');
    });

    c.connect(self._config.sshConfig);

    return defer.promise;
};

module.exports = SSHTunnel;

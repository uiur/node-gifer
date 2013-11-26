'use strict';

var exec = require('child_process').exec
  , mkdirp = require('mkdirp')
  , uid = require('uid2');

module.exports = gifer;

function command (array) {
  return array.join(' ');
}

function gifer (input, output, opts, callback) {
  if (!input) throw new Error('input required');
  if (!output) throw new Error('output required');

  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  } else {
    opts = opts || {};
  }

  var rate = opts.rate || 10
    , delay = opts.delay || 100 / rate;

  var tmpdir = '/tmp/' + uid(10) + '/';

  function finalize (err, callback) {
    exec(command(['rm -rf', tmpdir]));
    callback(err);
  }

  function countOfFiles (path, callback) {
    exec(command(['ls', path, '| wc -l | awk "{ print $1 }"']), function (err, stdout, stderr) {
      callback(err, Number(stdout));
    });
  }

  function gifsicle (callback) {
    exec(command(['gifsicle', '-O2', '--delay', String(delay), '--loop', '--colors 256', tmpdir + '*.gif', '>', output]), function (err) {
      if (err) return finalize(err);

      finalize(null, callback);
    });
  }

  mkdirp(tmpdir, function (err) {
    if (err) return callback(err);

    exec(command(['ffmpeg', '-i', input, '-r', String(rate), tmpdir + '%04d.png']), function (err) {
      if (err) return finalize(err);

      var PARALLEL_THRESHOLD = 20;

      countOfFiles(tmpdir + '*.png', function (err, count) {
        var next = function (err) {
          if (err) return finalize(err);

          gifsicle(callback);
        }

        if (count > PARALLEL_THRESHOLD) {
          exec(command(['ls', tmpdir + '*.png',
                        '| parallel -N' + String(PARALLEL_THRESHOLD) + '-j +0 gm mogrify -format gif {}']), next);
        } else {
          exec(command(['gm mogrify -format gif', tmpdir + '*.png']), next);
        }
      });
    });
  });
}
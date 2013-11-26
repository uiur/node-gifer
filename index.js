'use strict';

var exec = require('child_process').exec
  , path = require('path')
  , fs = require('fs')
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

  var tmpdir = opts.tmpdir
             ? path.join(opts.tmpdir, '/')
             : '/tmp/' + uid(10) + '/';

  function finalize (err, callback) {
    exec(command(['rm -rf', tmpdir]));
    callback(err);
  }

  function countOfFiles (path, callback) {
    exec(command(['ls', path, '| wc -l | awk "{ print $1 }"']), function (err, stdout, stderr) {
      callback(err, Number(stdout));
    });
  }

  function gifsicle (files, callback) {
    exec(command(['gifsicle', '-O2', '--delay', String(delay), '--loop', '--colors 256', files, '>', output]), function (err) {
      if (err) return finalize(err);

      finalize(null, callback);
    });
  }

  mkdirp(tmpdir, function (err) {
    if (err) return callback(err);

    var extract_frames = ['ffmpeg', '-i', input, '-r', String(rate)];
    if (opts.width || opts.height) {
      var width = opts.width || -1;
      var height = opts.height || -1;

      extract_frames.push('-vf', '"scale=' + String(width) + ':' + String(height) + '"');
    }
    extract_frames.push(tmpdir + '%04d.png');

    exec(command(extract_frames), function (err) {
      if (err) return finalize(err);

      var PARALLEL_THRESHOLD = 20;

      countOfFiles(tmpdir + '*.png', function (err, count) {
        if (count > PARALLEL_THRESHOLD) {
          exec(command(['ls', tmpdir + '*.png',
                        '| parallel -N' + String(PARALLEL_THRESHOLD) + '-j +0 gm mogrify -format gif {}']), next);
        } else {
          exec(command(['gm mogrify -format gif', tmpdir + '*.png']), next);
        }

        function next (err) {
          if (err) return finalize(err);

          var files = tmpdir + '*.gif';

          if (opts.reverse) {
            files = fs.readdirSync(tmpdir)
                    .filter(function(file) { return /\.gif/.test(file) })
                    .map(function(file) { return tmpdir + file })
                    .reverse()
                    .join(' ');
          }

          gifsicle(files, callback)
        }
      });
    });
  });
}
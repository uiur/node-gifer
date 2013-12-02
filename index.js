'use strict';

var exec = require('child_process').exec
  , path = require('path')
  , fs = require('fs')
  , mkdirp = require('mkdirp')
  , uid = require('uid2');

module.exports = gifer;

function command(array) {
  return array.join(' ');
}

function isLikeImage(filename) {
  return (/\.(gif|png|jpg|jpeg)$/i).test(filename);
}

function changeExtension(file_path, new_ext) {
  return path.join(path.dirname(file_path), path.basename(file_path, path.extname(file_path)) + new_ext);
}

function gifer(input, output, opts, callback) {
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

  if (Array.isArray(input)) {
    if (input.every(function (file) { return isLikeImage(file) })) {
      return createGIFFromFrames(input, callback);
    }

    if (input.length > 1) {
      throw new Error('invalid input: ' + input.join(' '));
    }

    input = input[0];
  }

  function finalize(err) {
    exec(command(['rm -rf', tmpdir]));
    callback(err);
  }

  function createGIFFromFrames(frames, callback) {
    var PARALLEL_THRESHOLD = 20;

    if (frames.length > PARALLEL_THRESHOLD) {
      exec(command(['ls', frames.join(' '),
                    '| parallel -N' + String(PARALLEL_THRESHOLD) + '-j +0 gm mogrify -format gif {}']), next);
    } else {
      exec(command(['gm mogrify -format gif', frames.join(' ')]), next);
    }

    function next(err) {
      if (err) return finalize(err);

      var files = frames.map(function (frame) {
        return changeExtension(frame, '.gif');
      });

      if (opts.reverse) {
        files = files.reverse();
      }

      gifsicle(files, callback)
    }
  }

  function gifsicle(files, callback) {
    exec(command(['gifsicle', '-O2', '--delay', String(delay), '--loop', '--colors 256', files.join(' '), '>', output]), function (err) {
      if (err) return finalize(err);

      finalize(null);
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

      var frames = fs.readdirSync(tmpdir).map(function (frame) { return tmpdir + frame });
      createGIFFromFrames(frames, callback);
    });
  });
}
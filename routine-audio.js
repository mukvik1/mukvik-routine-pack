'use strict';

function isRoutineAudio(name) {
  return typeof name === 'string' && /\.(mp3|wav|flac|m4a|aac|aif|aiff|ogg|opus|alac|wma)$/i.test(name);
}

module.exports = { isRoutineAudio };

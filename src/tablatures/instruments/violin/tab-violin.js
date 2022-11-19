import StringTablature from '../string-tablature';
import TabCommon from '../../tab-common';
import TabRenderer from '../../tab-renderer';
import ViolinPatterns from './violin-patterns';
import setViolinFonts from './violin-fonts';

/**
 * upon init mainly store provided instances for later usage
 * @param {*} abcTune  the parsed tune AST tree
 *  @param {*} tuneNumber  the parsed tune AST tree
 * @param {*} params  complementary args provided to Tablature Plugin
 */
Plugin.prototype.init = function (abcTune, tuneNumber, params) {
  var _super = new TabCommon(abcTune, tuneNumber, params);
  this.abcTune = abcTune;
  this._super = _super;
  this.linePitch = 3;
  this.nbLines = 4;
  this.isTabBig = false;
  this.capo = params.capo;
  this.transpose = params.visualTranspose;
  this.tablature = new StringTablature(this.nbLines, this.linePitch);
  var semantics = new ViolinPatterns(this);
  this.semantics = semantics;
};

Plugin.prototype.render = function (renderer, line, staffIndex) {
  if (this._super.inError) return;
  if (this.tablature.bypass(line)) return;
  setViolinFonts(this.abcTune);
  var rndrer = new TabRenderer(this, renderer, line, staffIndex);
  rndrer.doLayout();
};

function Plugin() {}

//
// Tablature plugin definition
//
var AbcViolinTab = function () {
  return { name: "ViolinTab", tablature: Plugin };
};

module.exports = AbcViolinTab;

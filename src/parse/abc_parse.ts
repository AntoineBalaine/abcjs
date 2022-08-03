//    abc_parse.js: parses a string representing ABC Music Notation into a usable internal structure.
import parseCommon from "./abc_common";
import parseDirective from "./abc_parse_directive";
import ParseHeader from "./abc_parse_header";
import ParseMusic from "./abc_parse_music";
import Tokenizer from "./abc_tokenizer";
import wrap from "./wrap_lines";

import Tune from "../data/abc_tune";
import TuneBuilder from "../parse/tune-builder";
import {
  AbcElem,
  ClefProperties,
  ElementType,
  Font,
  FormatAttributes,
  KeySignature,
  TuneObject,
} from "abcjs";

const Parse = function () {
  "use strict";
  let tune = new Tune();
  let tuneBuilder = new TuneBuilder(tune);
  let tokenizer;
  let wordsContinuation = "";
  let symbolContinuation = "";

  this.getTune = function () {
    let t: TuneObject = {
      formatting: tune.formatting,
      lines: tune.lines,
      media: tune.media,
      metaText: tune.metaText,
      metaTextInfo: tune.metaTextInfo,
      version: tune.version,

      addElementToEvents: tune.addElementToEvents,
      addUsefulCallbackInfo: tune.addUsefulCallbackInfo,
      getTotalTime: tune.getTotalTime,
      getTotalBeats: tune.getTotalBeats,
      getBarLength: tune.getBarLength,
      getBeatLength: tune.getBeatLength,
      getBeatsPerMeasure: tune.getBeatsPerMeasure,
      getBpm: tune.getBpm,
      getMeter: tune.getMeter,
      getMeterFraction: tune.getMeterFraction,
      getPickupLength: tune.getPickupLength,
      getKeySignature: tune.getKeySignature,
      getElementFromChar: tune.getElementFromChar,
      makeVoicesArray: tune.makeVoicesArray,
      millisecondsPerMeasure: tune.millisecondsPerMeasure,
      setupEvents: tune.setupEvents,
      setTiming: tune.setTiming,
      setUpAudio: tune.setUpAudio,
      deline: tune.deline,
    };
    if (tune.lineBreaks) t.lineBreaks = tune.lineBreaks;
    if (tune.visualTranspose) t.visualTranspose = tune.visualTranspose;
    return t;
  };

  function addPositioning(el: AbcElem, type, value) {
    if (!el.positioning) el.positioning = {};
    el.positioning[type] = value;
  }

  function addFont(el: AbcElem, type, value) {
    if (!el.fonts) el.fonts = {} as Font;
    el.fonts[type] = value;
  }

  type MultilineVars = {
    addFormattingOptions: (
      el: AbcElem,
      defaultFonts: any,
      elType: ElementType
    ) => void;
    differentFont: (type: any, defaultFonts: any) => true | false;
    duplicateStartEndingHoldOvers: () => void;
    reset: () => void;
    restoreStartEndingHoldOvers: () => void;

    annotationfont?: Font;
    gchordfont?: Font;
    globalTranspose?: number;
    iChar: number;
    is_in_header?: boolean;
    lineBreaks?: Array<number>;
    tripletfont?: Font;
    vocalfont?: Font;
    warningObjects?: Array<{ [key: string]: any }>;
    warnings?: Array<string>;

    barCounter?: {};
    chordPosition?: "auto";
    clef?: ClefProperties;
    currBarNumber?: number;
    default_length?: number;
    dynamicPosition?: "auto";
    endingHoldOver?: {
      inTie: any[];
      inTieChord: {};
    };
    freegchord?: boolean;
    hasMainTitle?: boolean;
    havent_set_length?: boolean;
    ignoredDecorations?: [];
    inEnding?: boolean;
    inTie: any[];
    inTieChord?: {};
    key?: KeySignature;
    macros?: {};
    meter?: null; // if no meter is specified, free meter is assumed
    next_note_duration?: number;
    openSlurs?: [];
    origMeter?: null; // this is for new voices that are created after we set the meter.
    ornamentPosition?: "auto";
    partForNextLine?: {};
    score_is_present?: boolean; // Can't have original V: lines when there is the score directive
    start_new_line?: boolean;
    staves?: [];
    tempoForNextLine?: [];
    vocalPosition?: "auto";
    voices?: {};
    volumePosition?: "auto";

    barsperstaff?: any;
    staffnonote?: any;
    papersize?: any;
    landscape?: any;
    barNumbers?: any;
    measurefont?: any;
    repeatfont?: any;
  };

  let multilineVars = <MultilineVars>{
    reset: function () {
      for (const property in this) {
        if (
          this.hasOwnProperty(property) &&
          typeof this[property as keyof MultilineVars] !== "function"
        ) {
          delete this[property as keyof MultilineVars];
        }
      }
      this.iChar = 0;
      this.key = { accidentals: [], root: "none", acc: "", mode: "" };
      this.meter = null; // if no meter is specified, free meter is assumed
      this.origMeter = null; // this is for new voices that are created after we set the meter.
      this.hasMainTitle = false;
      this.default_length = 0.125;
      this.clef = { type: "treble", verticalPos: 0 };
      this.next_note_duration = 0;
      this.start_new_line = true;
      this.is_in_header = true;
      this.partForNextLine = {};
      this.tempoForNextLine = [];
      this.havent_set_length = true;
      this.voices = {};
      this.staves = [];
      this.macros = {};
      this.currBarNumber = 1;
      this.barCounter = {};
      this.ignoredDecorations = [];
      this.score_is_present = false; // Can't have original V: lines when there is the score directive
      this.inEnding = false;
      this.inTie = [];
      this.inTieChord = {};
      this.vocalPosition = "auto"; // enum Placement { above; below; auto; }
      this.dynamicPosition = "auto";
      this.chordPosition = "auto";
      this.ornamentPosition = "auto";
      this.volumePosition = "auto";
      this.openSlurs = [];
      this.freegchord = false;
      this.endingHoldOver = {} as {
        inTie: any[];
        inTieChord: {};
      };
    },
    differentFont: function (type: FormatAttributes, defaultFonts) {
      if (
        this[type as keyof MultilineVars].decoration !==
        defaultFonts[type].decoration
      )
        return true;
      if (this[type as keyof MultilineVars].face !== defaultFonts[type].face)
        return true;
      if (this[type as keyof MultilineVars].size !== defaultFonts[type].size)
        return true;
      if (this[type as keyof MultilineVars].style !== defaultFonts[type].style)
        return true;
      if (
        this[type as keyof MultilineVars].weight !== defaultFonts[type].weight
      )
        return true;
      return false;
    },
    addFormattingOptions: function (
      el: AbcElem,
      defaultFonts,
      elType: ElementType
    ) {
      if (elType === ElementType.note) {
        if (this.vocalPosition !== "auto")
          addPositioning(el, "vocalPosition", this.vocalPosition);
        if (this.dynamicPosition !== "auto")
          addPositioning(el, "dynamicPosition", this.dynamicPosition);
        if (this.chordPosition !== "auto")
          addPositioning(el, "chordPosition", this.chordPosition);
        if (this.ornamentPosition !== "auto")
          addPositioning(el, "ornamentPosition", this.ornamentPosition);
        if (this.volumePosition !== "auto")
          addPositioning(el, "volumePosition", this.volumePosition);
        if (this.differentFont(FormatAttributes.annotationfont, defaultFonts))
          addFont(el, "annotationfont", this.annotationfont);
        if (this.differentFont(FormatAttributes.gchordfont, defaultFonts))
          addFont(el, "gchordfont", this.gchordfont);
        if (this.differentFont(FormatAttributes.vocalfont, defaultFonts))
          addFont(el, "vocalfont", this.vocalfont);
        if (this.differentFont(FormatAttributes.tripletfont, defaultFonts))
          addFont(el, "tripletfont", this.tripletfont);
      } else if (elType === ElementType.bar) {
        if (this.dynamicPosition !== "auto")
          addPositioning(el, "dynamicPosition", this.dynamicPosition);
        if (this.chordPosition !== "auto")
          addPositioning(el, "chordPosition", this.chordPosition);
        if (this.ornamentPosition !== "auto")
          addPositioning(el, "ornamentPosition", this.ornamentPosition);
        if (this.volumePosition !== "auto")
          addPositioning(el, "volumePosition", this.volumePosition);
        if (this.differentFont(FormatAttributes.measurefont, defaultFonts))
          addFont(el, "measurefont", this.measurefont);
        if (this.differentFont(FormatAttributes.repeatfont, defaultFonts))
          addFont(el, "repeatfont", this.repeatfont);
      }
    },
    duplicateStartEndingHoldOvers: function () {
      this.endingHoldOver = {
        inTie: [],
        inTieChord: {},
      };
      for (let i = 0; i < this.inTie.length; i++) {
        this.endingHoldOver.inTie.push([]);
        if (this.inTie[i]) {
          // if a voice is suppressed there might be a gap in the array.
          for (let j = 0; j < this.inTie[i].length; j++) {
            this.endingHoldOver.inTie[i].push(this.inTie[i][j]);
          }
        }
      }
      for (let key in this.inTieChord) {
        if (this.inTieChord.hasOwnProperty(key))
          this.endingHoldOver.inTieChord[key] = this.inTieChord[key];
      }
    },
    restoreStartEndingHoldOvers: function () {
      if (!this.endingHoldOver.inTie) return;
      this.inTie = [];
      this.inTieChord = {};
      for (let i = 0; i < this.endingHoldOver.inTie.length; i++) {
        this.inTie.push([]);
        for (let j = 0; j < this.endingHoldOver.inTie[i].length; j++) {
          this.inTie[i].push(this.endingHoldOver.inTie[i][j]);
        }
      }
      for (let key in this.endingHoldOver.inTieChord) {
        if (this.endingHoldOver.inTieChord.hasOwnProperty(key))
          this.inTieChord[key] = this.endingHoldOver.inTieChord[key];
      }
    },
  };

  let addWarning = function (str: string) {
    if (!multilineVars.warnings) multilineVars.warnings = [];
    multilineVars.warnings.push(str);
  };

  let addWarningObject = function (warningObject: { [key: string]: any }) {
    if (!multilineVars.warningObjects) multilineVars.warningObjects = [];
    multilineVars.warningObjects.push(warningObject);
  };

  let encode = function (str: string) {
    let ret = parseCommon.gsub(str, "\x12", " ");
    ret = parseCommon.gsub(ret, "&", "&amp;");
    ret = parseCommon.gsub(ret, "<", "&lt;");
    return parseCommon.gsub(ret, ">", "&gt;");
  };

  let warn = function (str: string, line: string | undefined, col_num: number) {
    if (!line) line = " ";
    let bad_char = line.charAt(col_num);
    if (bad_char === " ") bad_char = "SPACE";
    let clean_line =
      encode(line.substring(col_num - 64, col_num)) +
      '<span style="text-decoration:underline;font-size:1.3em;font-weight:bold;">' +
      bad_char +
      "</span>" +
      encode(line.substring(col_num + 1).substring(0, 64));
    addWarning(
      "Music Line:" +
        tokenizer.lineIndex +
        ":" +
        (col_num + 1) +
        ": " +
        str +
        ":  " +
        clean_line
    );
    addWarningObject({
      message: str,
      line: line,
      startChar: multilineVars.iChar + col_num,
      column: col_num,
    });
  };

  let header;
  let music;

  this.getWarnings = function () {
    return multilineVars.warnings;
  };
  this.getWarningObjects = function () {
    return multilineVars.warningObjects;
  };

  let addWords = function (line, words) {
    if (words.indexOf("\x12") >= 0) {
      wordsContinuation += words;
      return;
    }
    words = wordsContinuation + words;
    wordsContinuation = "";

    if (!line) {
      warn("Can't add words before the first line of music", line, 0);
      return;
    }
    words = parseCommon.strip(words);
    if (words.charAt(words.length - 1) !== "-") words = words + " "; // Just makes it easier to parse below, since every word has a divider after it.
    let word_list = [];
    // first make a list of words from the string we are passed. A word is divided on either a space or dash.
    let last_divider = 0;
    let replace = false;
    let addWord = function (i) {
      let word = parseCommon.strip(words.substring(last_divider, i));
      word = word.replace(/\\([-_*|~])/g, "$1");
      last_divider = i + 1;
      if (word.length > 0) {
        if (replace) word = parseCommon.gsub(word, "~", " ");
        let div = words.charAt(i);
        if (div !== "_" && div !== "-") div = " ";
        word_list.push({
          syllable: tokenizer.translateString(word),
          divider: div,
        });
        replace = false;
        return true;
      }
      return false;
    };
    let escNext = false;
    for (let i = 0; i < words.length; i++) {
      switch (words[i]) {
        case " ":
        case "\x12":
          addWord(i);
          break;
        case "-":
          if (!escNext && !addWord(i) && word_list.length > 0) {
            parseCommon.last(word_list).divider = "-";
            word_list.push({ skip: true, to: "next" });
          }
          break;
        case "_":
          if (!escNext) {
            addWord(i);
            word_list.push({ skip: true, to: "slur" });
          }
          break;
        case "*":
          if (!escNext) {
            addWord(i);
            word_list.push({ skip: true, to: "next" });
          }
          break;
        case "|":
          if (!escNext) {
            addWord(i);
            word_list.push({ skip: true, to: "bar" });
          }
          break;
        case "~":
          if (!escNext) {
            replace = true;
          }
          break;
      }
      escNext = words[i] === "\\";
    }

    let inSlur = false;
    parseCommon.each(line, function (el: AbcElem) {
      if (word_list.length !== 0) {
        if (word_list[0].skip) {
          switch (word_list[0].to) {
            case "next":
              if (el.el_type === "note" && el.pitches !== null && !inSlur)
                word_list.shift();
              break;
            case "slur":
              if (el.el_type === "note" && el.pitches !== null)
                word_list.shift();
              break;
            case "bar":
              if (el.el_type === "bar") word_list.shift();
              break;
          }
          if (el.el_type !== "bar") {
            if (el.lyric === undefined)
              el.lyric = [{ syllable: "", divider: " " }];
            else el.lyric.push({ syllable: "", divider: " " });
          }
        } else {
          if (el.el_type === "note" && el.rest === undefined && !inSlur) {
            let lyric = word_list.shift();
            if (lyric.syllable)
              lyric.syllable = lyric.syllable.replace(/ +/g, "\xA0");
            if (el.lyric === undefined) el.lyric = [lyric];
            else el.lyric.push(lyric);
          }
        }
      }
    });
  };

  let addSymbols = function (line, words) {
    if (words.indexOf("\x12") >= 0) {
      symbolContinuation += words;
      return;
    }
    words = symbolContinuation + words;
    symbolContinuation = "";

    // TODO-PER: Currently copied from w: line. This needs to be read as symbols instead.
    if (!line) {
      warn("Can't add symbols before the first line of music", line, 0);
      return;
    }
    words = parseCommon.strip(words);
    if (words.charAt(words.length - 1) !== "-") words = words + " "; // Just makes it easier to parse below, since every word has a divider after it.
    let word_list = [];
    // first make a list of words from the string we are passed. A word is divided on either a space or dash.
    let last_divider = 0;
    let replace = false;
    let addWord = function (i) {
      let word = parseCommon.strip(words.substring(last_divider, i));
      last_divider = i + 1;
      if (word.length > 0) {
        if (replace) word = parseCommon.gsub(word, "~", " ");
        let div = words.charAt(i);
        if (div !== "_" && div !== "-") div = " ";
        word_list.push({
          syllable: tokenizer.translateString(word),
          divider: div,
        });
        replace = false;
        return true;
      }
      return false;
    };
    for (let i = 0; i < words.length; i++) {
      switch (words.charAt(i)) {
        case " ":
        case "\x12":
          addWord(i);
          break;
        case "-":
          if (!addWord(i) && word_list.length > 0) {
            parseCommon.last(word_list).divider = "-";
            word_list.push({ skip: true, to: "next" });
          }
          break;
        case "_":
          addWord(i);
          word_list.push({ skip: true, to: "slur" });
          break;
        case "*":
          addWord(i);
          word_list.push({ skip: true, to: "next" });
          break;
        case "|":
          addWord(i);
          word_list.push({ skip: true, to: "bar" });
          break;
        case "~":
          replace = true;
          break;
      }
    }

    let inSlur = false;
    parseCommon.each(line, function (el: AbcElem) {
      if (word_list.length !== 0) {
        if (word_list[0].skip) {
          switch (word_list[0].to) {
            case "next":
              if (el.el_type === "note" && el.pitches !== null && !inSlur)
                word_list.shift();
              break;
            case "slur":
              if (el.el_type === "note" && el.pitches !== null)
                word_list.shift();
              break;
            case "bar":
              if (el.el_type === "bar") word_list.shift();
              break;
          }
        } else {
          if (el.el_type === "note" && el.rest === undefined && !inSlur) {
            let lyric = word_list.shift();
            if (el.lyric === undefined) el.lyric = [lyric];
            else el.lyric.push(lyric);
          }
        }
      }
    });
  };

  let parseLine = function (line: string) {
    if (parseCommon.startsWith(line, "%%")) {
      let err = parseDirective.addDirective(line.substring(2));
      if (err) warn(err, line, 2);
      return;
    }

    let i = line.indexOf("%");
    if (i >= 0) line = line.substring(0, i);
    line = line.replace(/\s+$/, "");

    if (line.length === 0) return;

    if (wordsContinuation) {
      addWords(tuneBuilder.getCurrentVoice(), line.substring(2));
      return;
    }
    if (symbolContinuation) {
      addSymbols(tuneBuilder.getCurrentVoice(), line.substring(2));
      return;
    }
    if (line.length < 2 || line.charAt(1) !== ":" || music.lineContinuation) {
      music.parseMusic(line);
      return;
    }

    let ret = header.parseHeader(line);
    if (ret.regular) music.parseMusic(line);
    if (ret.newline) music.startNewLine();
    if (ret.words) addWords(tuneBuilder.getCurrentVoice(), line.substring(2));
    if (ret.symbols)
      addSymbols(tuneBuilder.getCurrentVoice(), line.substring(2));
  };

  function appendLastMeasure(voice, nextVoice) {
    voice.push({
      el_type: "hint",
    });
    for (let i = 0; i < nextVoice.length; i++) {
      let element = nextVoice[i];
      let hint = parseCommon.clone(element);
      voice.push(hint);
      if (element.el_type === "bar") return;
    }
  }

  function addHintMeasure(staff, nextStaff) {
    for (let i = 0; i < staff.length; i++) {
      let stave = staff[i];
      let nextStave = nextStaff[i];
      if (nextStave) {
        // Be sure there is the same number of staves on the next line.
        for (let j = 0; j < nextStave.voices.length; j++) {
          let nextVoice = nextStave.voices[j];
          let voice = stave.voices[j];
          if (voice) {
            // Be sure there are the same number of voices on the previous line.
            appendLastMeasure(voice, nextVoice);
          }
        }
      }
    }
  }

  function addHintMeasures() {
    for (let i = 0; i < tune.lines.length; i++) {
      let line = tune.lines[i].staff;
      if (line) {
        let j = i + 1;
        while (j < tune.lines.length && tune.lines[j].staff === undefined) j++;
        if (j < tune.lines.length) {
          let nextLine = tune.lines[j].staff;
          addHintMeasure(line, nextLine);
        }
      }
    }
  }

  this.parse = function (strTune, switches, startPos) {
    // the switches are optional and cause a difference in the way the tune is parsed.
    // switches.header_only : stop parsing when the header is finished
    // switches.stop_on_warning : stop at the first warning encountered.
    // switches.print: format for the page instead of the browser.
    // switches.format: a hash of the desired formatting commands.
    // switches.hint_measures: put the next measure at the end of the current line.
    // switches.transpose: change the key signature, chords, and notes by a number of half-steps.
    if (!switches) switches = {};
    if (!startPos) startPos = 0;
    tune.reset();

    // Take care of whatever line endings come our way
    // Tack on newline temporarily to make the last line continuation work
    strTune = strTune.replace(/\r\n?/g, "\n") + "\n";

    // get rid of latex commands. If a line starts with a backslash, then it is replaced by spaces to keep the character count the same.
    let arr = strTune.split("\n\\");
    if (arr.length > 1) {
      for (let i2 = 1; i2 < arr.length; i2++) {
        while (arr[i2].length > 0 && arr[i2][0] !== "\n") {
          arr[i2] = arr[i2].substr(1);
          arr[i2 - 1] += " ";
        }
      }
      strTune = arr.join("  "); //. the split removed two characters, so this puts them back
    }
    // take care of line continuations right away, but keep the same number of characters
    strTune = strTune.replace(
      /\\([ \t]*)(%.*)*\n/g,
      function (all, backslash, comment) {
        let padding = comment ? Array(comment.length + 1).join(" ") : "";
        return backslash + "\x12" + padding + "\n";
      }
    );
    let lines = strTune.split("\n");
    if (parseCommon.last(lines).length === 0)
      // remove the blank line we added above.
      lines.pop();
    tokenizer = new Tokenizer(lines, multilineVars);
    header = new ParseHeader(tokenizer, warn, multilineVars, tune, tuneBuilder);
    music = new ParseMusic(
      tokenizer,
      warn,
      multilineVars,
      tune,
      tuneBuilder,
      header
    );

    if (switches.print) tune.media = "print";
    multilineVars.reset();
    multilineVars.iChar = startPos;
    if (switches.visualTranspose) {
      multilineVars.globalTranspose = parseInt(switches.visualTranspose);
      if (multilineVars.globalTranspose === 0)
        multilineVars.globalTranspose = undefined;
      else tuneBuilder.setVisualTranspose(switches.visualTranspose);
    } else multilineVars.globalTranspose = undefined;
    if (switches.lineBreaks) {
      // The line break numbers are 0-based and they reflect the last measure of the current line.
      multilineVars.lineBreaks = switches.lineBreaks;
      //multilineVars.continueall = true;
    }
    header.reset(tokenizer, warn, multilineVars, tune);

    try {
      if (switches.format) {
        parseDirective.globalFormatting(switches.format);
      }
      let line = tokenizer.nextLine();
      while (line) {
        if (switches.header_only && multilineVars.is_in_header === false)
          throw "normal_abort";
        if (switches.stop_on_warning && multilineVars.warnings)
          throw "normal_abort";

        let wasInHeader = multilineVars.is_in_header;
        parseLine(line);
        if (wasInHeader && !multilineVars.is_in_header) {
          tuneBuilder.setRunningFont(
            "annotationfont",
            multilineVars.annotationfont
          );
          tuneBuilder.setRunningFont("gchordfont", multilineVars.gchordfont);
          tuneBuilder.setRunningFont("tripletfont", multilineVars.tripletfont);
          tuneBuilder.setRunningFont("vocalfont", multilineVars.vocalfont);
        }
        line = tokenizer.nextLine();
      }

      if (wordsContinuation) {
        addWords(tuneBuilder.getCurrentVoice(), "");
      }
      if (symbolContinuation) {
        addSymbols(tuneBuilder.getCurrentVoice(), "");
      }
      multilineVars.openSlurs = tuneBuilder.cleanUp(
        multilineVars.barsperstaff,
        multilineVars.staffnonote,
        multilineVars.openSlurs
      );
    } catch (err) {
      if (err !== "normal_abort") throw err;
    }

    let ph = 11 * 72;
    let pl = 8.5 * 72;
    switch (multilineVars.papersize) {
      //case "letter": ph = 11*72; pl = 8.5*72; break;
      case "legal":
        ph = 14 * 72;
        pl = 8.5 * 72;
        break;
      case "A4":
        ph = 11.7 * 72;
        pl = 8.3 * 72;
        break;
    }
    if (multilineVars.landscape) {
      let x = ph;
      ph = pl;
      pl = x;
    }
    if (!tune.formatting.pagewidth) tune.formatting.pagewidth = pl;
    if (!tune.formatting.pageheight) tune.formatting.pageheight = ph;

    if (switches.hint_measures) {
      addHintMeasures();
    }

    wrap.wrapLines(tune, multilineVars.lineBreaks, multilineVars.barNumbers);
  };
};

module.exports = Parse;

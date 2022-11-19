import drawStaffGroup from './staff-group';
import setPaperSize from './set-paper-size';
import nonMusic from './non-music';
import spacing from '../abc_spacing';
import Selectables from './selectables';

function draw(
  renderer: any,
  classes: any,
  abcTune: any,
  width: any,
  maxWidth: any,
  responsive: any,
  scale: any,
  selectTypes: any,
  tuneNumber: any,
  lineOffset: any
) {
  // @ts-expect-error TS(7009): 'new' expression, whose target lacks a construct s... Remove this comment to see the full error message
  var selectables = new Selectables(renderer.paper, selectTypes, tuneNumber);
  renderer.paper.openGroup();
  renderer.moveY(renderer.padding.top);
  nonMusic(renderer, abcTune.topText, selectables);
  renderer.paper.closeGroup();
  renderer.moveY(renderer.spacing.music);
  var staffgroups = [];
  for (var line = 0; line < abcTune.lines.length; line++) {
    classes.incrLine();
    var abcLine = abcTune.lines[line];
    if (abcLine.staff) {
      renderer.paper.openGroup();
      if (abcLine.vskip) {
        renderer.moveY(abcLine.vskip);
      }
      if (staffgroups.length >= 1)
        addStaffPadding(
          renderer,
          renderer.spacing.staffSeparation,
          staffgroups[staffgroups.length - 1],
          abcLine.staffGroup
        );
      var staffgroup = engraveStaffLine(
        renderer,
        abcLine.staffGroup,
        selectables,
        line
      );
      staffgroup.line = lineOffset + line; // If there are non-music lines then the staffgroup array won't line up with the line array, so this keeps track.
      staffgroups.push(staffgroup);
      renderer.paper.closeGroup();
    } else if (abcLine.nonMusic) {
      renderer.paper.openGroup();
      nonMusic(renderer, abcLine.nonMusic, selectables);
      renderer.paper.closeGroup();
    }
  }

  classes.reset();
  if (
    abcTune.bottomText &&
    abcTune.bottomText.rows &&
    abcTune.bottomText.rows.length > 0
  ) {
    renderer.paper.openGroup();
    renderer.moveY(24); // TODO-PER: Empirically discovered. What variable should this be?
    nonMusic(renderer, abcTune.bottomText, selectables);
    renderer.paper.closeGroup();
  }
  setPaperSize(renderer, maxWidth, scale, responsive);
  return { staffgroups: staffgroups, selectables: selectables.getElements() };
}

function engraveStaffLine(renderer: any, staffGroup: any, selectables: any, lineNumber: any) {
  drawStaffGroup(renderer, staffGroup, selectables, lineNumber);
  // @ts-expect-error TS(2339): Property 'STEP' does not exist on type '{}'.
  var height = staffGroup.height * spacing.STEP;
  renderer.y += height;
  return staffGroup;
}

function addStaffPadding(
  renderer: any,
  staffSeparation: any,
  lastStaffGroup: any,
  thisStaffGroup: any
) {
  var lastStaff = lastStaffGroup.staffs[lastStaffGroup.staffs.length - 1];
  var lastBottomLine = -(lastStaff.bottom - 2); // The 2 is because the scale goes to 2 below the last line.
  var nextTopLine = thisStaffGroup.staffs[0].top - 10; // Because 10 represents the top line.
  var naturalSeparation = nextTopLine + lastBottomLine; // This is how far apart they'd be without extra spacing
  // @ts-expect-error TS(2339): Property 'STEP' does not exist on type '{}'.
  var separationInPixels = naturalSeparation * spacing.STEP;
  if (separationInPixels < staffSeparation)
    renderer.moveY(staffSeparation - separationInPixels);
}

export default draw;

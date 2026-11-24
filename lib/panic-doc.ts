/**
 * The fake document: what it says, and how it is typed.
 *
 * The copy is real prose because the whole point is that someone walking past
 * reads a sentence, not a wall of lorem ipsum. Three essays at different
 * lengths, each split into paragraphs, so the text reads like a genuine
 * assignment in progress rather than a canned block that repeats.
 *
 * The typing model is pure and deterministic: given a character count, it
 * yields the same slice of the same essay. That means the caret, the word count
 * and the scroll position can all be derived from one number, and the component
 * never has to keep the document text in state — it renders a slice.
 */

export type DocEssay = {
  id: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
};

export const DOC_ESSAYS: DocEssay[] = [
  {
    id: 'english',
    title: 'Term 4 English Essay Draft',
    subtitle: 'Year 10 English · Mr Henderson',
    paragraphs: [
      'The central tension in “The Crucible” is not between good and evil, but between reputation and truth. Miller builds Salem as a place where a name matters more than a fact, and every character is forced to choose which one they can afford to lose. The play is less interested in the devil than in what people will do to keep their standing in a room.',
      'Proctor is the clearest example. His refusal to sign the confession is not simply defiance; it is a man deciding that the version of himself written on paper would outlive the version he actually is. Miller makes the audience sit with that choice rather than celebrate an easy martyrdom, because Proctor has already lied and already behaved badly, and the play never lets us forget it.',
      'Abigail works in the opposite direction. She understands exactly how the town rewards a convincing performance of virtue, and she uses that understanding with a precision that is genuinely frightening. What makes her dangerous is not malice but competence: she has learned, correctly, what a room of frightened adults will believe.',
      'The court scenes turn this into structure rather than theme. Once the court accepts reputation as evidence, the play’s language shifts. Sentences become shorter, accusations replace questions, and the audience loses the ability to tell who is speaking to whom. Miller is showing us how a system can make truth optional without ever announcing that it has done so.',
      'By the final act the honest characters are the ones with the least to protect, which is the play’s quiet argument: integrity is not a virtue you demonstrate when it is cheap. Miller does not resolve this so much as leave it standing, and that is why the ending still works on a modern audience who has never set foot in Salem in 1692.',
    ],
  },
  {
    id: 'history',
    title: 'Term 4 History Source Analysis',
    subtitle: 'Year 10 History · Ms Fowler',
    paragraphs: [
      'This source is a recruitment poster published in Australia in 1915, and its purpose is persuasion rather than record. The poster addresses the viewer directly, using a single figure and very little text, so that the message arrives before the reader has time to argue with it. Its audience is unenlisted men, and possibly their families, on a home front still recovering from the first reports of Gallipoli.',
      'The imagery is doing most of the work. The central figure is lit from one side, which creates a sense of duty being asked for rather than demanded, and the uniform is drawn to look familiar rather than martial. There is no violence in the frame at all. That absence is deliberate: a poster commissioned to build support could not afford to show what the enlistment actually led to.',
      'The poster is reliable as evidence of attitudes, not events. It tells us what the Commonwealth believed would move men in 1915, and how quickly the argument shifted from adventure to obligation as the casualty lists grew. It tells us nothing reliable about the reality of the Western Front, because it was never trying to.',
      'Comparing it with a later poster from 1917 shows that shift clearly. The second poster’s language is sharper, the guilt is more direct, and the image has lost its softness. Two years changed the tone from invitation to pressure, which is useful evidence about the limits of voluntary enlistment.',
      'The main limitation is that we cannot know how the audience responded. A poster is evidence of an intention, and historians have to be careful not to read its effectiveness back into the source itself. What can be claimed with confidence is that the government thought sentiment was the decisive tool, and that this belief is visible in the design choices it paid for.',
    ],
  },
  {
    id: 'science',
    title: 'Term 4 Science Investigation',
    subtitle: 'Year 10 Science · Mr Adeyemi',
    paragraphs: [
      'The aim of this investigation was to determine how the surface area of a soda-acid reaction affects the rate at which carbon dioxide is produced. The hypothesis was that increasing the surface area of the tablet would increase the reaction rate, because a reaction can only occur where the reactants meet.',
      'The independent variable was the number of pieces into which the tablet was broken: one whole tablet, two halves, four quarters and eight eighths. The dependent variable was the time taken for the collection vessel to fill with 100 mL of gas. Controlled variables included the temperature of the water, the mass of the tablet, and the volume of acid used.',
      'Results followed the expected trend, but not linearly. The whole tablet took well over two minutes, while the eight pieces finished in under forty seconds. The largest jump came between the whole tablet and the two halves, which suggests that the initial break exposes a disproportionate amount of new surface compared with later splits.',
      'One anomalous trial occurred in the whole-tablet run, where the gas collection nearly stalled. On review, the tablet had rested against the side of the flask, reducing contact with the acid. That trial was repeated and excluded from the mean, and the reason recorded rather than simply deleted.',
      'The conclusion is that surface area affects reaction rate as predicted, but the relationship is not a straight line at the sizes tested. A useful extension would be to measure gas volume every ten seconds rather than only the total time, since the rate is clearly changing within each trial and a single finishing time hides that.',
    ],
  },
];

/** Total characters in an essay, so the caller knows when it is "finished". */
export function essayLength(essay: DocEssay): number {
  return essay.paragraphs.join('\n\n').length;
}

/**
 * The document as it would look after `typed` characters.
 *
 * Returns the paragraphs already reached, with the last one partial, so the
 * component can render real paragraphs (with real spacing) instead of one long
 * string with newlines in it.
 */
export function docSlice(essay: DocEssay, typed: number): { text: string[]; done: boolean } {
  const total = essayLength(essay);
  const limit = Math.max(0, Math.min(total, Math.floor(typed)));
  const text: string[] = [];
  let remaining = limit;
  for (const paragraph of essay.paragraphs) {
    if (remaining <= 0) break;
    text.push(paragraph.slice(0, remaining));
    remaining -= paragraph.length + 2; // the blank line between paragraphs
  }
  return { text, done: limit >= total };
}

/** Google Docs-style word count: words in the visible slice. */
export function wordCount(essay: DocEssay, typed: number): number {
  const { text } = docSlice(essay, typed);
  return text.join(' ').split(/\s+/).filter(Boolean).length;
}

/**
 * How many characters a keystroke should add.
 *
 * Typing one character per keypress reads as a machine. Real typing arrives in
 * bursts — three or four letters, then a pause — so a small deterministic
 * burst derived from the keystroke index gives that rhythm without any random
 * state to keep. The value is bounded so a held key still advances smoothly.
 */
export function burstFor(keystroke: number): number {
  const pattern = [1, 1, 2, 1, 3, 1, 1, 2];
  return pattern[keystroke % pattern.length];
}

/**
 * The hidden exit.
 *
 * Three ways out, none of them on screen: the panic combo again, typing
 * "ggout" at any point, or seven clicks on the word count in quick succession.
 * The last one exists because someone may be stuck without knowing the combo,
 * and a fake document you cannot leave is a trap rather than a feature.
 */
export const EXIT_WORD = 'ggout';

export function shouldExitOnWord(buffer: string): boolean {
  return buffer.toLowerCase().endsWith(EXIT_WORD);
}

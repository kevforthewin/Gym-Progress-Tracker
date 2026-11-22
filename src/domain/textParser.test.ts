import { describe, expect, it } from 'vitest';
import { parseTrainingText } from './textParser';

const brief = (t: string) =>
  parseTrainingText(t).map((e) => `${e.name}${e.side ? ` [${e.side}]` : ''}: ${e.sets.map((s) => `${s.weightKg}x${s.reps}${s.excluded ? '!' : ''}${s.warmup ? 'w' : ''}`).join(' ')}`);

describe('parseTrainingText', () => {
  it('versteht den Chat-Stil', () => {
    const text = `Back extension 68 a 15/15/15
Bauchmuskelmaschine 56 a 11/11/12
Hoist preacher curl
60 a 10/8/8
Reverse butterfly
45 einseitig dieses Mal mit beiden Beinen auf der Seite für mehr Druck - 11/11/11
Incline curls kurzhantel
12.5 a 10/10/10`;
    expect(brief(text)).toEqual([
      'Back extension: 68x15 68x15 68x15',
      'Bauchmuskelmaschine: 56x11 56x11 56x12',
      'Hoist preacher curl: 60x10 60x8 60x8',
      'Reverse butterfly: 45x11 45x11 45x11',
      'Incline curls kurzhantel: 12.5x10 12.5x10 12.5x10',
    ]);
  });

  it('Seiten, pro Seite, Körpergewicht, Klammern, Fließtext', () => {
    const text = `Heute pull im Iron:
Klimmzüge
7/7/6
Reverse butterfly
Links 54 a 8/8/8
Rechts 54 a 7/8/8
Kabel zur Seite einarmig
6,8 a 10/10/10 pro Seite
Hoist mid row machine (nimm mal auf als neue Referenz)
70 kg a 9/10/10 - Entfernung der Brusthalterung war auf 6 - gut
Trizepsmaschine
79 a 12/12/9mejr Zeit ist heute nicht
Fertig - hatte eben trizeps mit Bizeps verwechselt`;
    expect(brief(text)).toEqual([
      'Klimmzüge: 0x7 0x7 0x6',
      'Reverse butterfly [L]: 54x8 54x8 54x8',
      'Reverse butterfly [R]: 54x7 54x8 54x8',
      'Kabel zur Seite einarmig [L]: 6.8x10 6.8x10 6.8x10',
      'Kabel zur Seite einarmig [R]: 6.8x10 6.8x10 6.8x10',
      'Hoist mid row machine: 70x9 70x10 70x10',
      'Trizepsmaschine: 79x12 79x12 79x9',
    ]);
  });

  it('gemischte Gewichte, Markierungen, Aufwärmen, Teilwiederholungen', () => {
    const text = `Face Pull 23,8 x 12, 21,3 x 12/12
Hammercurls 15 a 6 unsauber
Hammercurls 12,5 a 10/6
Cable Fly 14 a 10 warmup
Cable Fly 21 a 6/7
Hoist Incline Press 65 × 10,5/9/8,5`;
    expect(brief(text)).toEqual([
      'Face Pull: 23.8x12 21.3x12 21.3x12',
      'Hammercurls: 15x6! 12.5x10 12.5x6',
      'Cable Fly: 14x10w 21x6 21x7',
      'Hoist Incline Press: 65x10.5 65x9 65x8.5',
    ]);
  });
});

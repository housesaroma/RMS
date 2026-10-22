import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles BOM, quotes, escaped quotes, both delimiters and blank lines', () => {
    expect(parseCsv('\uFEFFa;b\r\n"x;1";"say ""hi"""\n\n2;3')).toEqual([
      ['a', 'b'],
      ['x;1', 'say "hi"'],
      ['2', '3'],
    ]);
    expect(parseCsv('a,b\n1,"2,5"')).toEqual([
      ['a', 'b'],
      ['1', '2,5'],
    ]);
  });
});

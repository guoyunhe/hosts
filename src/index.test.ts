import { hosts } from '.';

describe('hosts', () => {
  it('normal', async () => {
    expect(hosts('Foo', 'Bar')).toBe('Foo Bar');
  });

  it('lastName upper case', async () => {
    expect(hosts('Foo', 'Bar', { lastNameUpperCase: true })).toBe('Foo BAR');
  });
});

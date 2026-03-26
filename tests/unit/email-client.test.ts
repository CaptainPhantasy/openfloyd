import { jest } from '@jest/globals';
import { EmailEventSource, __emailParserInternals } from '../../src/messaging/email-client.js';

describe('EmailEventSource parser', () => {
  it('parses basic raw email fields', () => {
    const raw = [
      'From: Douglas <douglas@floydlabs.com>',
      'Subject: Build Update',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Ship it.',
    ].join('\r\n');

    const parsed = __emailParserInternals.parseRawEmail(raw);
    expect(parsed.from).toBe('douglas@floydlabs.com');
    expect(parsed.subject).toBe('Build Update');
    expect(parsed.text).toContain('Ship it.');
  });

  it('extracts address from plain from header without angle brackets', () => {
    const address = __emailParserInternals.extractEmailAddress('douglas.talley@legacyai.space');
    expect(address).toBe('douglas.talley@legacyai.space');
  });
});

describe('EmailEventSource integration (mocked imapflow)', () => {
  let client: {
    connect: jest.Mock<() => Promise<void>>;
    logout: jest.Mock<() => Promise<void>>;
    mailboxOpen: jest.Mock<(path: string) => Promise<void>>;
    search: jest.Mock<(query: unknown) => Promise<number[]>>;
    fetchOne: jest.Mock<(seq: number, query: unknown) => Promise<unknown>>;
    messageFlagsAdd: jest.Mock<(seq: number, flags: string[]) => Promise<void>>;
  };

  beforeEach(() => {
    client = {
      connect: jest.fn(async () => undefined),
      logout: jest.fn(async () => undefined),
      mailboxOpen: jest.fn(async () => undefined),
      search: jest.fn(async () => []),
      fetchOne: jest.fn(async () => ({})),
      messageFlagsAdd: jest.fn(async () => undefined),
    };

    jest.doMock('imapflow', () => ({
      ImapFlow: class {
        connect = client.connect;
        logout = client.logout;
        mailboxOpen = client.mailboxOpen;
        search = client.search;
        fetchOne = client.fetchOne;
        messageFlagsAdd = client.messageFlagsAdd;
      },
    }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('imapflow');
  });

  it('emits event for allowed sender and marks message seen', async () => {
    client.search.mockResolvedValueOnce([1]).mockResolvedValueOnce([]);
    client.fetchOne.mockResolvedValueOnce({
      source: [
        'From: Douglas <douglas@floydlabs.com>',
        'Subject: Hello',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Email body',
      ].join('\r\n'),
    });

    const source = new EmailEventSource({
      host: 'imap.hostinger.com',
      port: 993,
      secure: true,
      user: 'floyd@legacyai.space',
      pass: 'x',
      pollIntervalMs: 60_000,
      allowedFrom: ['douglas@floydlabs.com'],
    });

    const events: unknown[] = [];
    source.onEvent((event) => events.push(event));

    await source.start();
    await source.stop();

    expect(events.length).toBe(1);
    const first = events[0] as { metadata?: { source?: string; from?: string } };
    expect(first.metadata?.source).toBe('email');
    expect(first.metadata?.from).toBe('douglas@floydlabs.com');
    expect(client.messageFlagsAdd).toHaveBeenCalledWith(1, ['\\Seen']);
  });

  it('ignores unauthorized sender and still marks message seen', async () => {
    client.search.mockResolvedValueOnce([2]).mockResolvedValueOnce([]);
    client.fetchOne.mockResolvedValueOnce({
      source: [
        'From: Evil <evil@example.com>',
        'Subject: Bad',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Intrusion',
      ].join('\r\n'),
    });

    const source = new EmailEventSource({
      host: 'imap.hostinger.com',
      port: 993,
      secure: true,
      user: 'floyd@legacyai.space',
      pass: 'x',
      pollIntervalMs: 60_000,
      allowedFrom: ['douglas@floydlabs.com'],
    });

    const events: unknown[] = [];
    source.onEvent((event) => events.push(event));

    await source.start();
    await source.stop();

    expect(events.length).toBe(0);
    expect(client.messageFlagsAdd).toHaveBeenCalledWith(2, ['\\Seen']);
  });
});

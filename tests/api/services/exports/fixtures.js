/**
 * In-memory zip fixtures for parser tests. Keeps test data inline so the
 * repo doesn't carry binary fixture blobs — and so we can tweak shapes
 * without regenerating files.
 */

import AdmZip from 'adm-zip';

export function buildDiscordZip() {
  const zip = new AdmZip();
  zip.addFile('account/user.json', Buffer.from(JSON.stringify({
    id: '1234',
    username: 'stefano',
    discriminator: '0001',
    created_at: '2020-01-01T00:00:00Z',
  })));
  zip.addFile('messages/index.json', Buffer.from(JSON.stringify({
    '1111': '#general',
    '2222': '#random',
    '3333': 'DM with friend',
  })));
  zip.addFile('servers/index.json', Buffer.from(JSON.stringify({
    'g100': 'Best Server',
    'g200': 'Other Server',
  })));
  zip.addFile('servers/g100/guild.json', Buffer.from(JSON.stringify({ id: 'g100', name: 'Best Server' })));
  zip.addFile('servers/g200/guild.json', Buffer.from(JSON.stringify({ id: 'g200', name: 'Other Server' })));

  zip.addFile('messages/c1111/channel.json', Buffer.from(JSON.stringify({
    id: '1111', name: 'general', type: 0, guild: { id: 'g100', name: 'Best Server' },
  })));
  zip.addFile('messages/c1111/messages.csv', Buffer.from(
    [
      'ID,Timestamp,Contents,Attachments',
      '900,"2026-05-01T10:00:00.000+00:00","hello",',
      '901,"2026-05-01T22:00:00.000+00:00","late one",',
      '902,"2026-05-02T11:00:00.000+00:00","another",',
    ].join('\n')
  ));

  zip.addFile('messages/c2222/channel.json', Buffer.from(JSON.stringify({
    id: '2222', name: 'random', type: 0, guild: { id: 'g100', name: 'Best Server' },
  })));
  zip.addFile('messages/c2222/messages.csv', Buffer.from(
    [
      'ID,Timestamp,Contents,Attachments',
      '950,"2026-05-03T09:00:00.000+00:00","x",',
    ].join('\n')
  ));

  zip.addFile('messages/c3333/channel.json', Buffer.from(JSON.stringify({
    id: '3333', name: null, type: 1,
  })));
  zip.addFile('messages/c3333/messages.csv', Buffer.from(
    [
      'ID,Timestamp,Contents,Attachments',
      '960,"2026-05-04T14:00:00.000+00:00","hey",',
      '961,"2026-05-04T15:00:00.000+00:00","sup",',
    ].join('\n')
  ));

  return zip.toBuffer();
}

export function buildLinkedInZip() {
  const zip = new AdmZip();
  zip.addFile(
    'Connections.csv',
    Buffer.from(
      [
        'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
        'Alice,Doe,,,Acme,Engineer,01 Jan 2025',
        'Bob,Roe,,,Acme,Engineer,02 Jan 2025',
        'Carol,Lin,,,Globex,Designer,03 Jan 2025',
      ].join('\n')
    )
  );
  zip.addFile(
    'Reactions.csv',
    Buffer.from(
      [
        'Date,Type,Link',
        '2026-05-01,LIKE,https://x',
        '2026-05-02,LIKE,https://y',
        '2026-05-03,PRAISE,https://z',
      ].join('\n')
    )
  );
  zip.addFile(
    'Searches.csv',
    Buffer.from(
      [
        'Search Query,Search Date',
        'machine learning,2026-05-01',
        'startup ideas,2026-05-02',
        'machine learning,2026-05-03',
      ].join('\n')
    )
  );
  zip.addFile(
    'Shares.csv',
    Buffer.from(
      [
        'Date,Content',
        '2026-05-15,first post',
        '2026-05-20,second post',
      ].join('\n')
    )
  );
  zip.addFile(
    'Profile.csv',
    Buffer.from(
      [
        'First Name,Last Name,Headline,Summary',
        'Stefano,G,Builder,A long summary text',
      ].join('\n')
    )
  );
  zip.addFile(
    'Skills.csv',
    Buffer.from(
      [
        'Name',
        'JavaScript',
        'Python',
        'React',
      ].join('\n')
    )
  );
  zip.addFile(
    'Positions.csv',
    Buffer.from(
      [
        'Company Name,Title,Started On',
        'Acme,Engineer,01 Jan 2024',
      ].join('\n')
    )
  );
  return zip.toBuffer();
}

export function buildInstagramZip() {
  const zip = new AdmZip();
  zip.addFile(
    'personal_information/personal_information.json',
    Buffer.from(JSON.stringify({
      profile_user: [{ string_map_data: { Username: { value: 'stefano' } } }],
    }))
  );

  zip.addFile(
    'your_activity/content/posts_1.json',
    Buffer.from(JSON.stringify([
      { creation_timestamp: 1730000000 },
      { creation_timestamp: 1731000000 },
    ]))
  );
  zip.addFile(
    'your_activity/content/reels.json',
    Buffer.from(JSON.stringify([
      { creation_timestamp: 1732000000 },
    ]))
  );
  zip.addFile(
    'your_activity/content/stories.json',
    Buffer.from(JSON.stringify([]))
  );

  zip.addFile(
    'your_activity/likes/liked_posts.json',
    Buffer.from(JSON.stringify({
      likes_media_likes: [
        { string_list_data: [{ timestamp: 1733000000 }] },
        { string_list_data: [{ timestamp: 1734000000 }] },
      ],
    }))
  );

  zip.addFile(
    'your_activity/saved/saved_posts.json',
    Buffer.from(JSON.stringify({
      saved_saved_media: [
        { string_map_data: { 'Saved on': { timestamp: 1735000000 } } },
        { string_map_data: { 'Saved on': { timestamp: 1736000000 } } },
        { string_map_data: { 'Saved on': { timestamp: 1737000000 } } },
      ],
    }))
  );

  zip.addFile(
    'your_activity/comments/post_comments_1.json',
    Buffer.from(JSON.stringify({
      comments_media_comments: [{}, {}, {}, {}],
    }))
  );

  zip.addFile(
    'your_activity/searches/account_searches.json',
    Buffer.from(JSON.stringify({
      searches_user: [
        { string_map_data: { Search: { value: 'travel' } } },
        { string_map_data: { Search: { value: 'travel' } } },
        { string_map_data: { Search: { value: 'food' } } },
      ],
    }))
  );

  return zip.toBuffer();
}

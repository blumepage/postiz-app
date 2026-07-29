import { parseFragment } from 'parse5';

type PortableTextSpan = {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
};

type PortableTextMarkDefinition = {
  _type: 'link';
  _key: string;
  href: string;
};

export type PortableTextBlock = {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h2' | 'h3' | 'blockquote';
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDefinition[];
  listItem?: 'bullet' | 'number';
  level?: number;
};

type ParseNode = {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: ParseNode[];
};

const blockTags = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'pre',
]);

export function htmlToPortableText(html: string): PortableTextBlock[] {
  const root = parseFragment(html || '') as unknown as ParseNode;
  const blocks: PortableTextBlock[] = [];
  let keyIndex = 0;
  const nextKey = (prefix: string) => `${prefix}${(keyIndex++).toString(36)}`;

  const addBlock = (
    node: ParseNode,
    options: {
      style?: PortableTextBlock['style'];
      listItem?: PortableTextBlock['listItem'];
      level?: number;
      inheritedMarks?: string[];
    } = {}
  ) => {
    const markDefs: PortableTextMarkDefinition[] = [];
    const children: PortableTextSpan[] = [];

    const walkInline = (current: ParseNode, marks: string[] = []) => {
      if (current.nodeName === '#text') {
        const text = (current.value || '').replace(/\s+/g, ' ');
        if (text) {
          children.push({
            _type: 'span',
            _key: nextKey('s'),
            text,
            marks,
          });
        }
        return;
      }

      const tag = current.tagName?.toLowerCase();
      if (tag === 'br') {
        children.push({
          _type: 'span',
          _key: nextKey('s'),
          text: '\n',
          marks,
        });
        return;
      }

      let nextMarks = marks;
      if (tag === 'strong' || tag === 'b') nextMarks = [...marks, 'strong'];
      if (tag === 'em' || tag === 'i') nextMarks = [...marks, 'em'];
      if (tag === 'code' || tag === 'pre') nextMarks = [...marks, 'code'];
      if (tag === 'a') {
        const href = current.attrs?.find((attr) => attr.name === 'href')?.value;
        if (href) {
          const markKey = nextKey('m');
          markDefs.push({ _type: 'link', _key: markKey, href });
          nextMarks = [...marks, markKey];
        }
      }

      for (const child of current.childNodes || []) {
        if (!['ul', 'ol'].includes(child.tagName?.toLowerCase() || '')) {
          walkInline(child, nextMarks);
        }
      }
    };

    for (const child of node.childNodes || []) {
      walkInline(child, options.inheritedMarks || []);
    }

    const first = children[0];
    const last = children.at(-1);
    if (first) first.text = first.text.replace(/^\s+/, '');
    if (last) last.text = last.text.replace(/\s+$/, '');
    const compactChildren = children.filter((child) => child.text.length > 0);
    if (compactChildren.length === 0) return;

    let style = options.style || 'normal';
    if (style === 'normal' && compactChildren.length === 1) {
      const markdownHeading =
        compactChildren[0].text.match(/^(#{1,4})\s+(.+)$/);
      if (markdownHeading) {
        style = markdownHeading[1].length <= 2 ? 'h2' : 'h3';
        compactChildren[0].text = markdownHeading[2];
      }
    }

    blocks.push({
      _type: 'block',
      _key: nextKey('b'),
      style,
      children: compactChildren,
      markDefs,
      ...(options.listItem ? { listItem: options.listItem } : {}),
      ...(options.level ? { level: options.level } : {}),
    });
  };

  const walkBlocks = (
    node: ParseNode,
    listItem?: PortableTextBlock['listItem'],
    level = 1
  ) => {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const nextListItem = tag === 'ol' ? 'number' : 'bullet';
      for (const child of node.childNodes || []) {
        if (child.tagName?.toLowerCase() === 'li') {
          addBlock(child, { listItem: nextListItem, level });
          for (const nested of child.childNodes || []) {
            if (['ul', 'ol'].includes(nested.tagName?.toLowerCase() || '')) {
              walkBlocks(nested, nextListItem, level + 1);
            }
          }
        }
      }
      return;
    }

    if (tag === 'li') {
      addBlock(node, { listItem: listItem || 'bullet', level });
      return;
    }

    if (tag && blockTags.has(tag)) {
      const style: PortableTextBlock['style'] =
        tag === 'h1' || tag === 'h2'
          ? 'h2'
          : tag === 'h3' || tag === 'h4'
          ? 'h3'
          : tag === 'blockquote'
          ? 'blockquote'
          : 'normal';
      addBlock(node, {
        style,
        inheritedMarks: tag === 'pre' ? ['code'] : [],
      });
      return;
    }

    const children = node.childNodes || [];
    const hasBlockChildren = children.some((child) => {
      const childTag = child.tagName?.toLowerCase() || '';
      return blockTags.has(childTag) || childTag === 'ul' || childTag === 'ol';
    });
    if (!hasBlockChildren) {
      addBlock(node);
      return;
    }
    for (const child of children) walkBlocks(child, listItem, level);
  };

  walkBlocks(root);
  return blocks;
}

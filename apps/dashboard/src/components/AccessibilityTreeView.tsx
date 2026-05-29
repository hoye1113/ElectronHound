import { useState } from 'react';
import { useTranslation, type TFunction } from 'react-i18next';
import { ChevronRight, ChevronDown, TreePine } from 'lucide-react';

interface AccessibilityTreeNode {
  role: string;
  name: string;
  children?: AccessibilityTreeNode[];
}

interface AccessibilityTreeViewProps {
  snapshot: AccessibilityTreeNode | string | null;
}

export default function AccessibilityTreeView({ snapshot }: AccessibilityTreeViewProps) {
  const { t } = useTranslation();

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <TreePine className="mb-2 size-6 text-zinc-600" />
        <p className="text-sm text-zinc-500">{t('a11yTree.empty')}</p>
        <p className="mt-1 text-xs text-zinc-600">{t('a11yTree.emptyHint')}</p>
      </div>
    );
  }

  if (typeof snapshot === 'string') {
    return (
      <div className="overflow-auto">
        <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-zinc-300">
          {snapshot}
        </pre>
      </div>
    );
  }

  return (
    <div className="overflow-auto" role="tree" aria-label={t('common.a11yTree')}>
      <TreeNode node={snapshot} depth={0} t={t} />
    </div>
  );
}

interface TreeNodeProps {
  node: AccessibilityTreeNode;
  depth: number;
  t: TFunction;
}

function TreeNode({ node, depth, t }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <button
        type="button"
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left transition-colors hover:bg-zinc-800/50 ${
          hasChildren ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        aria-label={node.name ? t('a11yTree.nodeLabel', { role: node.role, name: node.name }) : t('a11yTree.nodeLabelSimple', { role: node.role })}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-zinc-500" />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-xs font-medium text-indigo-300">
          {node.role}
        </span>
        {node.name && (
          <span className="truncate text-xs text-zinc-300">{node.name}</span>
        )}
        {hasChildren && (
          <span className="ml-auto text-xs text-zinc-600">
            {node.children!.length}
          </span>
        )}
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, index) => (
            <TreeNode key={`${child.role}-${child.name}-${index}`} node={child} depth={depth + 1} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

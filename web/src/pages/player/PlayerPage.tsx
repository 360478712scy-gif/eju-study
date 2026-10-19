// Route #/session/<id>: full-screen focus player, or the summary of a finished session.
import { useMemo } from 'react';
import type { Item } from '@shared/types.ts';
import { useApp } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { Button, Empty } from '../../components/ui.tsx';
import { Player, leaving } from './Player.tsx';
import { FinishView } from './FinishView.tsx';
import './player.css';

function Gone({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="pl-gone">
      <Empty
        icon="search"
        title={title}
        desc={desc}
        action={
          <Button variant="primary" iconRight="arrowRight" onClick={() => navigate('/')}>
            回到今日
          </Button>
        }
      />
    </div>
  );
}

export function PlayerPage({ sessionId }: { sessionId?: string }) {
  const session = useApp((s) => (sessionId ? s.state?.sessions[sessionId] : undefined));
  const bank = useApp((s) => s.bank);
  const idsKey = session?.itemIds.join('|') ?? '';
  const items = useMemo(
    () => (bank && idsKey ? idsKey.split('|').map((id) => bank.byId.get(id)).filter((it): it is Item => !!it) : []),
    [bank, idsKey],
  );

  if (!session) {
    if (sessionId && leaving.id === sessionId) return null;
    return <Gone title="找不到这组练习" desc="它可能已经结束或被清理了。今日页有接下来要做的任务。" />;
  }
  if (!items.length) return <Gone title="这组题暂时打不开" desc="题库里找不到这些题目，可能是题库更新了。回到今日页换一组练习。" />;
  if (session.finishedAt) return <FinishView key={session.id} session={session} items={items} />;
  return <Player key={session.id} session={session} items={items} />;
}

import { useEffect, useState } from 'react';
import type { NotificationGroupView } from '@housework/shared';
import { getNotificationGroup } from '../api/client';
import type { Authorized } from './useSession';

/** お知らせ先の表示の状態。読み込み中と失敗のときは何も出さない（表示は補助の情報で、画面全体を止めない）。 */
export type NotificationGroupState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: NotificationGroupView | null };

/** お知らせ先を読む。enabled が false のときは API を呼ばない（子供のカレンダーの枠など）。 */
export function useNotificationGroup(
  authorized: Authorized,
  enabled: boolean,
): NotificationGroupState {
  const [state, setState] = useState<NotificationGroupState>({ kind: 'loading' });
  const [wasEnabled, setWasEnabled] = useState(enabled);

  // 有効になるたびに読み込み中へ戻し、前の結果を見せたままにしない（描画中の状態の調整）
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (enabled) setState({ kind: 'loading' });
  }

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () =>
      authorized(getNotificationGroup).then(
        (value) => active && setState({ kind: 'ready', value }),
        () => active && setState({ kind: 'error' }),
      );
    void load();
    // LIFF に戻ってきたとき（グループで登録したあと）に読み直す
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authorized, enabled]);

  return state;
}

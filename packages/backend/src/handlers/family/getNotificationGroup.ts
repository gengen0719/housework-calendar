import type { NotificationGroupView } from '@housework/shared';
import { requireMembership } from '../../middleware/requireMembership';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/**
 * F5: 画面用のお知らせ先（C1 GET /family/notification-group）。管理者も子供も見られる。
 * お知らせ先がなければ null。グループ ID は返さない。家族はセッションの利用者から決める。
 */
export async function getNotificationGroup(
  auth: AuthContext,
): Promise<NotificationGroupView | null> {
  const result = await familyMemberService.getNotificationGroupView(requireMembership(auth));
  return result.ok ? result.value : null;
}

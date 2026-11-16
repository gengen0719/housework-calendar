import { Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { AdjustmentPage } from './AdjustmentPage';
import { AdjustmentListPage } from './AdjustmentListPage';
import {
  ALLOWANCE_UNCONFIRMED_LABEL,
  ALLOWANCE_EMPTY_THIS_MONTH,
  ALLOWANCE_EMPTY_OTHER_MONTH,
  ALLOWANCE_NO_CHILDREN,
  ALLOWANCE_YOU_SUFFIX,
  ALLOWANCE_LOAD_FAILED_MESSAGE,
  MONTH_CONFIRMED_LABEL,
  MESSAGES,
  allowanceHeading,
  formatYen,
  monthOfDate,
  type Role,
} from '@housework/shared';
import { useAllowanceMonth } from '../hooks/useAllowanceMonth';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';

interface Props {
  authorized: Authorized;
  initialMonth?: string;
  currentUserId?: string;
  role?: Role;
  onBack: () => void;
}
export function AllowancePage({ authorized, initialMonth, currentUserId, role, onBack }: Props) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [listing, setListing] = useState(false);
  const { month, state, range, previous, next, reload } = useAllowanceMonth(
    authorized,
    initialMonth,
  );
  if (listing)
    return (
      <AdjustmentListPage
        key={month}
        authorized={authorized}
        month={month}
        onBack={() => {
          setListing(false);
          reload();
        }}
      />
    );
  if (editing && state.kind === 'ready')
    return (
      <AdjustmentPage
        key={month}
        authorized={authorized}
        month={month}
        children={state.value.allowances
          .filter((c) => c.current)
          .map((c) => ({ userId: c.childUserId, displayName: c.displayName }))}
        onBack={() => {
          setEditing(false);
          reload();
        }}
        onSaved={() => {
          setEditing(false);
          setNotice('保存しました。表示を読み込み直します');
          reload();
        }}
      />
    );
  return (
    <Stack spacing={2} data-testid="allowance-page">
      {notice && <Typography role="status">{notice}</Typography>}
      {role === 'admin' && (
        <Button onClick={() => setListing(true)} data-testid="allowance-adjustment-list">
          加算・減額の一覧
        </Button>
      )}
      {role === 'admin' && state.kind === 'ready' && !state.value.confirmed && (
        <Button onClick={() => setEditing(true)} data-testid="allowance-adjustments">
          加算・減額
        </Button>
      )}
      <Button onClick={onBack} data-testid="allowance-back">
        戻る
      </Button>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Button
          aria-label="前の月"
          onClick={previous}
          disabled={!range || month <= range.firstMonth}
          data-testid="allowance-previous"
        >
          &lt;
        </Button>
        {month !== 'current' && (
          <Typography component="h1" variant="h5">
            {allowanceHeading(month)}
          </Typography>
        )}
        <Button
          aria-label="次の月"
          onClick={next}
          disabled={!range || month >= range.lastMonth}
          data-testid="allowance-next"
        >
          &gt;
        </Button>
      </Stack>
      {state.kind === 'loading' && <Typography role="status">読み込み中…</Typography>}
      {state.kind === 'error' && (
        <Stack role="alert" spacing={1}>
          <Typography>
            {state.reason === 'NOT_FAMILY_MEMBER' ||
            state.reason === 'NOT_FRIEND' ||
            state.reason === 'INVALID_MONTH'
              ? MESSAGES[state.reason]
              : ALLOWANCE_LOAD_FAILED_MESSAGE}
          </Typography>
          <Button onClick={reload} data-testid="allowance-reload">
            読み込み直す
          </Button>
        </Stack>
      )}
      {state.kind === 'ready' && (
        <>
          <Typography>
            {state.value.confirmed ? MONTH_CONFIRMED_LABEL : ALLOWANCE_UNCONFIRMED_LABEL}
          </Typography>
          {state.value.allowances.length === 0 && <Typography>{ALLOWANCE_NO_CHILDREN}</Typography>}
          {state.value.allowances.map((child) => {
            const own = role === 'child' && child.childUserId === currentUserId;
            return (
              <Box
                component="section"
                key={child.childUserId}
                sx={{
                  p: 2,
                  overflowWrap: 'anywhere',
                  border: own ? `2px solid ${colors.primaryMain}` : undefined,
                  fontWeight: own ? 'bold' : undefined,
                  bgcolor: colors.backgroundPaper,
                }}
              >
                <Typography
                  component="h2"
                  variant="h6"
                  sx={{ fontWeight: own ? 'bold' : undefined }}
                >
                  {child.displayName} {formatYen(child.total)}
                  {own ? ALLOWANCE_YOU_SUFFIX : ''}
                </Typography>
                {child.lines.length === 0 && child.adjustments.length === 0 && (
                  <Typography>
                    {state.value.month === monthOfDate(state.value.today)
                      ? ALLOWANCE_EMPTY_THIS_MONTH
                      : ALLOWANCE_EMPTY_OTHER_MONTH}
                  </Typography>
                )}
                {child.lines.length > 0 && (
                  <Box component="ul">
                    {child.lines.map((line) => (
                      <li key={`${line.choreTypeId}:${line.unitPrice}`}>
                        {line.choreName} {formatYen(line.unitPrice)} x {line.count}回 ={' '}
                        {formatYen(line.amount)}
                      </li>
                    ))}
                  </Box>
                )}
                {child.adjustments.length > 0 && (
                  <Box component="ul">
                    {child.adjustments.map((line) => (
                      <li key={line.adjustmentId}>
                        {line.reason} {formatYen(line.amount)}
                      </li>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </>
      )}
    </Stack>
  );
}

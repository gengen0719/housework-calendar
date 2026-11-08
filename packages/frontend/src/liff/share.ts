import liff from '@line/liff';

/**
 * 招待の文を LINE で送る（NFR1.10）。
 * 送り先を選ぶ画面が使えればそれを開き、使えなければ LINE のシェアの URL を開く。
 * 送るのは管理者本人の LINE からで、送り先を選ばずに閉じても何も変わらない。
 */
export async function shareText(text: string): Promise<void> {
  if (liff.isApiAvailable('shareTargetPicker')) {
    try {
      await liff.shareTargetPicker([{ type: 'text', text }]);
    } catch {
      // 閉じた・送れなかったときは何も変えない
    }
    return;
  }
  window.open(
    `https://line.me/R/share?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

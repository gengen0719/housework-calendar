/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** LIFF アプリの ID（公開してよい値） */
  readonly VITE_LIFF_ID?: string;
  /** 公式アカウントの ID（例: @abc1234。公開してよい値） */
  readonly VITE_LINE_OA_ID?: string;
}

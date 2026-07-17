import { EventEmitter } from 'events';
/**
 * 実行イベントの共有バス
 *
 * REST route / WebSocket handler / Executor 間でイベントを中継する。
 * REST 経由で開始した実行の progress/complete/error も、
 * ここを通じて WebSocket クライアントへ配信される。
 */
export const executionEvents = new EventEmitter();
// 多数の同時実行でも警告が出ないように
executionEvents.setMaxListeners(100);

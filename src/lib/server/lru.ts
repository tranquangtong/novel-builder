/** LRU nhỏ trong bộ nhớ. Chỉ dùng cho dữ liệu bất biến được khóa theo sha (cache, không phải nguồn dữ liệu). */
export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }
}

export function calculateAuctionBids(gold) {
  return {
    party4: {
      bid: gold * 0.95 * (3 / 4),
      preemptiveBid: gold * 0.95 * (10 / 11) * (3 / 4)
    },
    party8: {
      bid: gold * 0.95 * (7 / 8),
      preemptiveBid: gold * 0.95 * (10 / 11) * (7 / 8)
    }
  };
}

export function formatGold(value) {
  return `${Math.floor(value).toLocaleString('ko-KR')} G`;
}

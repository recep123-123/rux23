# RUx OI Panel — No Demo Data QA

Version: RUx v0.74.2
Build: 0.74.2-oi-no-demo-data-guard-20260524

## Guarantee

The OI panel does not create demo/synthetic numeric market data for OI, price, delta, Z-score, momentum, exchange distribution, regime, or signal calculations.

## Real input sources

- Binance Futures openInterestHist
- Binance Futures klines
- Bybit public open interest, when available
- OKX public open interest, when available

## Derived fields

The following are model outputs calculated from real input data:

- OI Delta
- OI Z-Score
- OI Momentum
- OI/Price Divergence
- Regime/Bias
- Long/Short Squeeze risk
- Decision commentary
- Signal strip

## Proxy field

OI heat bands are a deterministic proxy visualization derived from OI and price-band data. It is not a fake liquidation map and does not invent random market values.

## v0.74.2 cleanup

- Removed random visual micro-stripes from the OI heatmap.
- Replaced them with deterministic texture based on actual band index/intensity.
- Renamed internal “mockup” comments to UI/model descriptions to avoid ambiguity.

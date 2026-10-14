# Aggregate train-count profile

`data/train-density-profile.json` contains **one** complete 19-route snapshot from
the 2026-10-14 16:31 KST survey. Its matching `.js` file exposes the same
counts as `window.SEOUL_TRAIN_PROFILE` for the offline map. This is an observed
weekday afternoon density anchor, **not** evidence of an all-day timetable,
service frequency, actual train speed, or every operating train. The simulation
must be labeled synthetic.

Each sample has a KST quarter-hour bucket and four route-level counts:
`reported` is the provider's raw row count; `visible` is the deduplicated count
with usable observations no older than 300 seconds; `fresh` is its up-to-90-second
subset; `stale` is the remaining 90–300-second subset. Future samples include
the backend fetch window. No train number, station, raw report, or credential is
written to either output file.

To take **one** later sample, explicitly enable the 19 confirmed feed routes in
the local Python backend, restart it, and run:

```bash
python3 tools/collect_train_profile.py --collect --server http://127.0.0.1:8787
```

The collector first checks the backend's enabled routes and KST ledger. It
refuses a sweep if fewer than 19 local calls remain or if the configured local
cap exceeds the currently verified 900-call protective cap. It requests the
existing localhost positions endpoint only once; the backend handles shared
cache, pagination, failures, and quota reservation. A failed or incomplete
route does not become a profile sample. A repeated cached snapshot is skipped.
There is no automatic scheduler or direct Seoul API request in this tool. Do not
leave another browser/client polling all 19 routes during collection.

At one page per route, 19 calls buy one sweep, so at most 47 complete sweeps fit
inside 900 calls in a day before other clients, pagination, retries, or previous
usage. Hourly sampling for 24 hours would need at least 456 calls. The local
ledger cannot account for other clients of the same provider key; check its
remaining allowance before each manual sweep. Data from several weekdays and
weekends would be needed before estimating typical time-of-day patterns.

To re-create the initial counts from the existing survey without spending API
quota, use `--import-survey PATH`. To regenerate only the offline browser file,
use `--build-js`. Both commands are offline. Run the tests with:

```bash
python3 -m unittest discover -s tools -p 'test_collect_train_profile.py'
```

Source: [Seoul TOPIS realtimePosition specification](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-12601&srvType=A).

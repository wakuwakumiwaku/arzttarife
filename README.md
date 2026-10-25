# TARDOC & Ambulante Pauschalen

Unabhängige deutschsprachige Quellenreferenz und exakter Szenariorechner für das Schweizer ambulante ärztliche Tarifsystem 2026. Vanilla ESM, Systemfonts, keine Laufzeitpakete oder externen Datenanfragen.

## Öffentlicher Umfang – bewusst begrenzt

**16 selbst formulierte Regel-/Quellenreferenzen und neun offizielle Quellziele. Keine öffentlich eingebetteten Tarifpositionen.** Die vollständigen offiziellen XLSX sind erreichbar; deren weltweite Weiterverteilung ist durch die geprüften OAAT-Bedingungen nicht als offen freigegeben. Deshalb werden keine OAAT-Texte, Originaldateien, Grouperdaten oder geschützten Komponenten ausgeliefert. Der konkrete Befund steht in [DATA.md](DATA.md).

Der Browser bleibt ohne Katalog nützlich: getrennte Tarifmodi, Volltextsuche und Bereichsfilter in der Referenz, Detailansichten, Quellen, Merkliste und ein transparenter Rechner mit selbst eingegebenem TPW. Kein Grouper, keine Abrechnungs-, Dignitäts-, Mengen- oder Kumulationsprüfung. Kein amtlicher TPW voreingestellt.

Nach lokalem, hashgeprüftem Import: **alle 1 388 TARDOC-Positionen und 314 Pauschalen** aus den exakt gepinnten Originalen einschließlich Originalinterpretationen, weiterer Positionsfelder und aller neun XLSX-Begleittabellen. Der Katalog bleibt ausschliesslich im Arbeitsspeicher des Tabs; er ist nicht in der JSON-Arbeitsstand-Sicherung enthalten.

## Lokal ausführen

Voraussetzungen: Node ≥22 und Python ≥3.10 (geprüft mit 3.14). Keine Python-Zusatzpakete.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run serve
```

Der lokale Server bindet nur an Loopback, standardmässig Port 3011. Ein anderer freier Port und ein Pages-artiger Pfad sind wählbar:

```sh
PORT=3012 BASE_PATH=/arzttarife/ npm run serve
```

`check`, `test` und `build` funktionieren ohne `sources/`, `.local/`, vorhandenes `dist/` oder Netzwerk. Originaldatenprüfungen einschliesslich der neun lokalen Katalog-Modusfälle laufen nur, wenn die bewusst nicht veröffentlichten Quellen bzw. deren Konvertierung lokal vorliegen; fehlende private Fixtures werden ausdrücklich als übersprungen markiert. Die Rechner-Modusprüfungen laufen immer.

### Separate native Browserprüfung

`tests/browser.mjs` ist über `npm run test:browser` registriert, nicht Teil von `npm test`. Der Befehl baut zuerst `dist/`, prüft dessen Bytes gegen die Runtime-Allowlist und startet danach einen eigenen kurzlebigen Loopback-Server unter `/arzttarife/` sowie eine isolierte Headless-Firefox-Instanz. Keine Installation, kein Zugriff auf bestehende Browserprofile, keine Veröffentlichung.

Vorher `PLAYWRIGHT_MODULE` auf die bereits installierte externe `playwright-core/index.mjs` (oder einen auflösbaren ESM-Modulnamen) und `BROWSER_EXECUTABLE` auf die zugehörige Firefox-Datei setzen. Die Browserbibliothek ist bewusst keine Laufzeit-/Lockfile-Abhängigkeit dieses öffentlichen Projekts. Optional wählt `LOCAL_CATALOG_FILE` die private Importdatei; ohne diese Variable wird nur eine tatsächlich vorhandene `.local/catalog.json` verwendet.

```sh
# Nach Bereitstellung der beiden externen Browser-Variablen:
npm run test:browser
# Nur registrierte Fälle/Dezimalorakel auflisten – ohne Browser und Server:
node tests/browser.mjs --list
node tests/browser.mjs --self-test
```

Die Suite umfasst 20 registrierte Fälle: Die ursprünglichen 19 Fallkörper, ihre Reihenfolge und Assertions bleiben unverändert. Fall 20 prüft Q01 über echten Dateiinput, gehaltenes originales File.text, tatsächliches Laden der gespeicherten Fassung, späte Dateilieferung und echte Vorschau/Übernahme mit Dirty-Draft-/Raw-Schutz. Ein DOM-Listeneradapter bestätigt den Abschluss des ursprünglichen Change-Handlers, ohne Produktfunktionen zu ersetzen. Die übrigen Fälle decken Referenz/Quellen/Details/Filter, unabhängige Decimal-Rechnung, Download/Dateiimporte, Speicher/Zweittab/Reload, Navigation, 1440/768/390/320px und Druckmedium ab. Drei private Fälle verlangen die echte hashgebundene Datei: alle 1 702 Positions-IDs samt sämtlichen Originaldetails und alle neun Begleittabellen mit allen 771 Originalzeilen und ihren 2 056 Originalzellen. Ohne Datei werden diese drei Fälle **übersprungen, nicht bestanden**; Responsive-Fälle verwenden dann die öffentliche Referenz statt Privatpositionen. Diese Q01-Vorbereitung führt keinen Browser aus; die historische Parent-Abnahme 19/19 CLI 0 gilt nur für den eingefrorenen v3-Vorgänger. Liste/Self-Test sind keine neue native oder unabhängige Freigabe.

Jeder native Lauf schreibt einen neuen ignorierten `.local/browser/RUN-…/`-Ordner mit `report.json`, tatsächlichen Downloads und Screenshots von Liste, Rechnerunterkante und Detailunterkante. Der Bericht zählt bestanden/fehlgeschlagen/übersprungen/nicht ausgeführt, protokolliert Node-/Python-/Browserversion, Runtime-/Runnerhashes und alle Seiten-, Konsolen- und Netzwerkkanäle. Fremde Speicherkeys werden als acht exakte Sentinel-Strings verglichen. Die Fehler-Allowlist ist leer; die deklarierten Storage-/File-I/O-Injektionen ersetzen keine Produktlogik. `finally` schliesst ausschliesslich eigene Kontexte, Browser und Server.

**Historie der nativen Prüfung:** Der eingefrorene Vorgänger R1/native-v1 wurde tatsächlich vollständig ausgeführt: **5 von 19 Fällen bestanden, 14 fehlgeschlagen**, keine übersprungen/nicht ausgeführt. Die Fehler entfielen auf die tatsächlich fehlende Positionsoption im HTML (sieben Fälle), falsch sortierte Download-Key-Erwartungen (sechs) und die fehlende Erwartung der Überschrift „Offizielle Quellen“ samt Quellliste (einer). Die Fehlerkanäle waren leer; eigene Kontexte, Browser und Server wurden geschlossen. Das ist kein PASS.

**Historische Vorbereitung R2/native-v2:** Gegenüber R1 wird ausschliesslich das fehlende öffnende Positions-`option`-Tag im Produkt-HTML ergänzt. Ein über die bestehende Python-Discovery registrierter stdlib-`HTMLParser`-Test prüft die drei expliziten, nicht deaktivierten Optionen. Seine identischen Testbytes scheiterten am unveränderten R1-HTML wegen der fehlenden `positions`-Option; der GREEN-Nachweis gehört zum separaten lokalen Prüfbeleg. Im nativen Beobachter werden nur beide Download-Key-Seiten sortiert und „Offizielle Quellen“ mit dem vollständigen Quelllistentext ausdrücklich erwartet; die exakten Quellanker-Prüfungen bleiben erhalten. Alle 19 Geschäftsfälle, sämtliche Originaldetailprüfungen und das unabhängige Decimal-Orakel bleiben bestehen.

Bei dieser R2-Vorbereitung wurde **kein Browser gestartet**. Offline-Tests und Fallliste sind weder native noch unabhängige Freigabe. Diese historischen Angaben beanspruchen keinen aktuellen späteren Prüfstatus; jede spätere native Ausführung benötigt ihren eigenen unveränderten Laufbericht. Der erschöpfende Originaldetaildurchlauf ist bewusst keine kurze Stichprobenprüfung.

## Vollständige Kataloge privat öffnen

Zuerst die eigene Nutzungsbefugnis und OAAT-Bedingungen prüfen. Die Werkzeuge akzeptieren keine Vereinbarung im Namen des Nutzers.

```sh
python3 scripts/acquire_sources.py --acknowledge-local-use
python3 scripts/import_catalog.py
```

Alternativ die beiden in `scripts/source-pins.json` genannten offiziellen XLSX selbst herunterladen und unter `sources/tardoc.xlsx` und `sources/pauschalen.xlsx` ablegen. Der Konverter arbeitet vollständig offline, verweigert abweichende Quellen und schreibt nur in ignorierte `.local/` oder `sources/`-Verzeichnisse. Die Datei `.local/catalog.json` dann über **Lokalen Katalog wählen** öffnen und die Vorschau bestätigen. Zurück zur öffentlichen Referenz geht es mit **Katalog aus Arbeitsspeicher entfernen** oder einem Neuladen.

Die Hashprüfung der Browserdatei belegt die Übereinstimmung mit genau diesem reproduzierbaren Konverter, keine digitale Signatur der OAAT. Für andere Editionen müssen Quellen, Profil und Import gemeinsam fachlich neu geprüft werden.

## Rechner und lokale Daten

- TARDOC: `(AL + IPL) × selbst eingegebener TPW × ganzzahlige Menge`.
- Pauschalen: `Taxpunkte × selbst eingegebener TPW × ganzzahlige Menge` für bereits bestimmte Pauschalen.
- Exakte BigInt-Dezimalrechnung, einmalige kaufmännische Schlussrundung auf 0.01 CHF; keine weitere Normierung und keine 5-Rappen-Rundung.
- Leere/offene Punkte bleiben unberechenbar, nicht null. Prozentpositionen werden nicht aus Titeln abgeleitet.
- Lokaler Import rundet Einzelkomponenten bewusst auf zwei Nachkommastellen. **Das tatsächliche XLSX enthält trotz Release notes teils längere Rohwerte.** Diese bleiben vollständig im Detail sichtbar; siehe DATA.md.
- Nur `arzttarife.workspace.v1` wird verwendet. Speicherung ausschliesslich per explizitem Knopf; keine Hintergrund-Autosaves. Gespeichert werden Rechnerfelder und Referenz-Merk-IDs, kein Katalog und keine Patientendaten.
- JSON öffnen: vollständige Schema-/Versions-/ID-Prüfung, nichtmutierende Vorschau, Abbrechen. Übernehmen ersetzt zunächst nur den ungespeicherten Entwurf. Beschädigter, gesperrter oder fremdgeänderter Browser-Speicher wird nicht überschrieben. Entwürfe lassen sich als JSON sichern.
- „Gespeicherte Fassung laden“ setzt vor dem Speicherlesen dieselbe Intentgrenze wie Importabbruch: ältere noch laufende Dateiimporte dürfen die neue Vorschau oder ihren Status nicht mehr ersetzen, auch bei einem fehlerhaften Saved-Read. Die registrierte Offline-Real-Caller-Regression verwendet die vollständige App/Domain; ihre 27 Fälle sind keine Browserabnahme, vier echte Katalogfälle laufen nur mit Privatdatei. Node benötigt dafür das im Testskript gesetzte `--experimental-vm-modules`; Python läuft isoliert mit `-I -B`.

## Betrieb und Dateisatz

`scripts/files.mjs` ist die einzige Runtime-Allowlist: acht Dateien. Der Build liest und prüft alle Inputs vor dem Ersetzen des letzten gültigen Builds und kopiert keine Verzeichnisbäume. Auch zufällig unter `public/` liegende Privatdateien bleiben ausgeschlossen. HTTP liefert nur diese acht Ziele; kein Upload-Endpunkt, kein Quellenverzeichnis, keine Schreibmethode.

[CODEBASE](docs/CODEBASE.md) beschreibt Module, Schemas, Datenfluss, Tests und den vollständigen expliziten Quell-Dateisatz: 30 zur Veröffentlichung vorgesehene Dateien, einschliesslich der Import-Intent-Regression und ihres Plattformadapters. Die acht Runtime-Dateien bleiben separat allowlistet. Die Pages-Konfiguration ist vorbereitet; dieses lokale Projekt behauptet keine bereits erfolgte Veröffentlichung.

Zieladressen: [Projektseite](https://wakuwakumiwaku.github.io/arzttarife/) · [Repository](https://github.com/wakuwakumiwaku/arzttarife). Neun Gesundheitskataloge sind über drei direkte und sechs eingeklappte normale Links verbunden.

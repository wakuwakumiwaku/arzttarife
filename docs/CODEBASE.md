# Codebasis und Schnittstellen

## Architektur

Statische, serverlose Vanilla-ESM-Anwendung. Kein Backend, kein Konto, keine Patientendaten, keine Laufzeitabhängigkeiten. JSON-Daten werden relativ zum aktuellen Pages-Unterpfad geladen. Alle Quelltexte und Eingaben werden durch DOM-Methoden und `textContent` ausgegeben. Keine unkontrollierten HTML-Sinks. CSP verhindert externe Skript-/Verbindungsziele.

### Laufzeit

- `index.html`: semantische Oberfläche, drei direkte/ein eigener aktueller Kataloglink und sechs eingeklappte Geschwisterlinks, Rechnerfelder, file inputs und native Dialoge. Styles/Skripte relativ.
- `src/app.js`: Boot, Modus-/Inhaltsumschaltung, vollständige Suche, DOM-Paginierung (30 Ergebnisse je Schritt), Originaldetails, Merkliste, exakte Rechnerrückmeldung, sichere Importvorschauen, JSON-Download und Speicher-Konflikthinweise. Datenfehler zeigen eine explizite Fehlermeldung; keine Ersatzdaten.
- `src/domain.js`: reine Rechen-/Validierungs-/Filterfunktionen sowie injizierbarer `WorkspaceStore`. BigInt-Festkomma statt binärer Gleitkomma-Beträge. `calculate` sowie Positions-/Begleittabellen-Modi verlangen vor `Object.hasOwn` einen primitiven String; Arrays, verschachtelte Arrays und Objekte dürfen nicht als Schlüssel koerziert werden. Die Browser-Rechenerwartungen stammen unabhängig von Python Decimal, nicht aus `calculate`.
- `src/styles.css`: dunkelviolett, 17px Basis/Inputs/Positionstitel, grosse Geldwerte, responsive einspaltige und zweispaltige Ansichten, nicht sticky, helle Druckansicht, native Fokusmarkierungen.
- `public/data/reference.json`: eigenständig geschriebene öffentliche Referenz mit 16 Einträgen und neun offiziellen Dokumentzielen.
- `public/data/provenance.json`: zwölf gesicherte Quellmetadaten ohne Originalinhalte/Header.
- `public/data/local-profile.json`: erwartete Bytezahl/SHA256, Edition, Mengen, Quellenidentitäten und deklarierte Komponenten-Rundung des optionalen privaten JSON-Katalogs.
- `public/favicon.svg`: eigene Vektorgrafik, kein externes Asset.

`document.body.dataset.ready='true'` wird erst nach erfolgreich geladener und validierter echter Referenz, aufgebauter Suche/Rechner und registrierten Aktionen gesetzt. `#search`, `#results`, `[data-id]`, `#detail-dialog`, `#close-detail`, `#reset` und `#more` bilden die Browser-Prüfhaken. `#view` trennt öffentliche Referenz, private Positionen und private Begleittabellen. Ohne Import wird in den beiden privaten Ansichten ausdrücklich der fehlende Katalog erläutert.

### Suche und Ergebnisgeneration

`filterRecords` prüft zuerst Modus, Bereich und Merkliste. Eine leere Suche projiziert keine Zeilen; sonst wird je verbleibender Zeile genau einmal derselbe Volltext aus ID, Code, Titel, Kurztext, Detail, Interpretation und Feldtexten normalisiert. Alle Wörter müssen enthalten sein; Quellreihenfolge und ursprüngliche Objektidentitäten bleiben erhalten. Kein Textindex oder Suchcache über Aufrufe/Katalogwechsel hinweg.

`renderResults` verwirft die vorige Ergebnisliste und filtert frisch; ohne Katalog bleibt die private Ergebnisliste leer. Suche, Reset, Bereich, Merkfilter, Modus, Ansicht, Katalogaktivierung/-ersatz/-entladen und bestätigter Workspace-Import beginnen wieder bei 30. Nur der bisherige Merken-Button erhält mit `renderResults(false)` die sichtbare Präfixlänge, sucht aber ebenfalls neu. Ausschliesslich „Mehr anzeigen“ verwendet die aktuelle gefilterte Liste weiter: `appendResults(before)` hängt nur die nächsten höchstens 30 Karten an, erhält bestehende DOM-Karten und verschiebt den Fokus wie bisher auf den ersten neuen Detailbutton. Keine generationsübergreifende Wiederverwendung von IDs oder Handlern.

### Datenbeschaffung und privater Import

- `scripts/source-pins.json`: exakt verifizierte öffentliche XLSX-URLs, Dateigrössen und SHA256, inklusive Abruf-/End-URL-Metadaten.
- `scripts/acquire_sources.py`: expliziter lokaler Download nach Rechtehinweis; keine Anmeldung, keine Vertragsannahme, keine geschützten Komponenten. Original, Header, End-URL, Abruf, Bytes, SHA256 zusammen sichern. Ein geänderter Download landet getrennt als `.unrecognized`.
- `scripts/import_catalog.py`: stdlib-ZIP/XML-Parser mit Archiv- und XML-Grenzen; keine openpyxl-Abhängigkeit. Erst Quellenhash prüfen, dann 1 702 eindeutige Positionen und alle neun Begleittabellen übernehmen. Nur `.local/` oder `sources/` als Ausgabebereich erlaubt. Komponenten-Rundung ist ausdrücklich definiert und Rohzelle bleibt separat erhalten. Keine Ableitung von Prozentlogik, Fallgruppen oder fehlenden Codes.

Reimport schreibt byteidentisches JSON ohne variable Laufzeit-/Absolutpfad-Felder. Der Browser prüft dieses gesamte JSON vor Aktivierung per UTF-8-Bytezahl, SHA256 und vollständiger Objektstruktur. Hashgleichheit ist eine Konverteridentität, keine OAAT-Signatur. Vor Übernahme wird eine nichtmutierende Vorschau angezeigt. Die Importdatei verbleibt nur im Tab-Arbeitsspeicher.

### Lokales Workspace-Schema

`app='arzttarife.workspace'`, `version=1`, `edition='2026-reference-v1'`, `mode` aus `tardoc|pauschalen`, `calculators` mit genau diesen zwei Modi, sowie `favorites` aus eindeutig bekannten öffentlichen Referenz-IDs. TARDOC-Felder: `al,ipl,tpw,quantity`; Pauschalen-Felder: `points,tpw,quantity`. Alle Werte sind Dezimal-/Ganzzahlstrings oder leere unvollständige Eingaben. Keine ungetypten Floats, Zusatzkeys, fremden Versionen oder beliebigen ID-Objekte.

Nur `arzttarife.workspace.v1` wird gelesen/geschrieben. Kein Autosave. `save` validiert den gesamten Entwurf, vergleicht den ursprünglichen rohen Storage-Wert unmittelbar vor dem Schreiben und liest das eigene Ergebnis zurück. Fremde Storage-Events sperren weitere Schreibversuche und erhalten den aktuellen Entwurf. Beschädigte oder nicht erreichbare Speicherdaten bleiben unangetastet. JSON-Export dient als Ausweg. Es gibt kein automatisches Merge oder „letzter Entwurf gewinnt“. Eine Konfliktsperre wird erst durch bewusstes Neuladen nach Sicherung des Entwurfs aufgehoben.

Arbeitsstand-Import ersetzt nach Bestätigung nur den Entwurf, nicht den gespeicherten Wert. Abbrechen, Escape und ungültige Dateien verändern weder Entwurf noch Speicher. Private Tarifkataloge werden nicht persistiert oder in Arbeitsstand-JSON eingebettet. Aus Tarifpositionen übernommene numerische Felder werden zu eigenen Rechner-Eingaben; das ist keine persistierte offizielle Fallzuordnung.

### Build-/Server-Schnittstellen

- `scripts/files.mjs` exportiert `runtimeFiles` als unveränderliche Ziel→Quell-Abbildung, genau acht Dateiziele. Keine rekursive Public-/Projekt-Kopie.
- `scripts/check.mjs` exportiert `validatedInputs(root)`: tatsächliche Inputs lesen, Symlinks/unsichere Pfade ablehnen, Schemas/Editionen/Hashmetadaten prüfen, kanonische Linkanzahl/ID-Hooks und unsichere DOM-Sinks prüfen.
- `scripts/build.mjs` exportiert `build(root)`: erst sämtliche Inputs validieren und im Speicher halten, dann eigenen Stage-Ordner schreiben, letztes `dist/` durch Rename mit Rückfallpfad ersetzen. Fehlende/ungültige Inputs löschen nicht den letzten gültigen Build. Nicht allowlistete Canary-Dateien bleiben ausgeschlossen.
- `scripts/serve.mjs` exportiert `createAppServer({root,basePath})`, Rückgabe ist ein noch nicht lauschender Node-HTTP-Server. Standardroot ist `dist/`, Standardpfad `/`. Nur GET/HEAD auf Runtime-Allowlist. Pfade ausserhalb, Quellen, Projektdateien, Symlinks und Schreibmethoden werden abgewiesen. CLI startet nur auf `127.0.0.1`, Port per `PORT`, Pfad per `BASE_PATH`.

### Registrierte Tests

`npm test` führt Node-Testdateien mit `--experimental-vm-modules` und isolierte Python-unittest-Discovery (`-I -B`) aus. `check` prüft auch die neue Importregression, ihren Plattformadapter und den nativen Runner syntaktisch, ohne diese zu importieren:

- `tests/domain.test.mjs`: exakte Rundung/Einheiten, fehlende und ungültige Zahlen, strict Workspace-/Referenzschema, Volltext-/Bereich-/Merkfilter, isolierter Speicherkey, beschädigter/gesperrter Speicher, Fremdänderung, Entwurfsschutz, optional echter lokaler Katalog und Paket-Tamper-Erkennung.
- `tests/context-types.test.mjs`: 19 fokussierte Primitiv-Modusfälle; Rechner immer, neun echte Katalogfälle nur mit privater Fixture. Verändert ausschliesslich den Modus einer realen Pauschalenposition bzw. -Begleittabelle; Counts, IDs und Quellfelder bleiben gültig. Positionsarrays scheiterten vorher schon später an der Quell-ID: dieser Teil fordert gezielt die frühe Tarifpositionsdiagnose. Rechner und Begleittabelle liefern echte Missing-exception-REDs. `TARIFF_DOMAIN_MODULE` bindet optional einen unveränderten Vorgänger für identische OLD/GREEN-Testbytes; Standard ist das eigene `src/domain.js`. `LOCAL_CATALOG_FILE` überschreibt optional die lokale Fixture.
- `tests/build-server.test.mjs`: Builds aus isolierter expliziter Inputkopie, private Canary-Verweigerung, Erhalt des letzten gültigen Builds nach ungültigen Quellen, echter kurzlebiger HTTP-Server unter `/arzttarife/`, exakte Runtimebytes, HEAD, MIME/Sicherheitsheader und 400/404/405-Grenzen.
- `tests/test_markup.py`: ein günstiger stdlib-`HTMLParser`-Regressionstest für genau ein echtes `#view`-Select mit den drei expliziten, nicht deaktivierten Optionen `reference`, `positions`, `contexts` und ihren vollständigen Beschriftungen. Die vorhandene `test_*.py`-Discovery registriert ihn ohne neue Abhängigkeit. `TARIFF_INDEX_FILE` bindet optional das unveränderte OLD-HTML für identische RED/GREEN-Testbytes; Standard ist das eigene `index.html`.
- `tests/test_import_catalog.py`: technische OOXML-Inline-/Shared-String-Parserfixtures, literal Codes und Unicode, Punktwerttypen und Komponenten-Rundung, Quellhashverweigerung, geänderten Download privat sichern statt Original ersetzen, optional vollständiger echter Import samt Konverterhash.
- `tests/import-intent.test.mjs` und `tests/helpers/import-platform.mjs`: 33 registrierte Real-Caller-Fälle mit vollständiger echter App und unveränderter Domain im VM-Kontext. Nur DOM, Startup-Fetch, localStorage sowie File.text-/WebCrypto-Liefergrenzen werden adaptiert; reale JSON-Texte und echte WebCrypto-Hashes bleiben erhalten. Zwei ursprüngliche QUALITY-Geschäftsfallkörper bleiben bytegleich. Geprüft werden aktueller Import, Saved-Recovery-Vorschau/Abbruch/Escape/Bestätigung, verspäteter Erfolg/ungültiger Text/Lesefehler, gescheiterte Saved-Lesung, explizites Speichern, neuere Dateien, Fremdänderung, Unload und vier optionale echte Privatkatalogkontrollen. Der Adapter bestätigt vollständigen Handlerabschluss; vor Warten auf File.text wird dessen tatsächliches Erreichen geprüft. Ein früher Typguard vor unveränderter voller Snapshot-Gleichheit vermeidet riesige Assertion-Diffs bei einem irrtümlich ausgewählten Katalog. Das Speicherorakel vergleicht den serialisierten Write mit dem kanonisierten rohen Saved-Before-Image statt VM-fremder Objektprototypen. `Q01_APP_ROOT` bindet für identische OLD/GREEN-Testbytes einen unveränderten Quellstand; ohne private Datei werden genau vier Fälle ausdrücklich übersprungen. Das sind modellierte Plattformprüfungen, keine nativen Browserläufe.
  Die sechs Such-/Renderfälle zählen Normalisierungen an der echten Domain-Grenze, prüfen Volltext-/Unicode-/Filterparität samt Objektidentität, 30→60→67 ohne erneute Suche oder Präfixersatz, den ersten neuen Fokus sowie Reset-/Import-/Merk-/Ansichts- und Katalogwechsel. Gleiche IDs mit ausschliesslich geänderten Notizen müssen neue Ergebnisse und Detailhandler liefern. Die ausdrücklich synthetischen RAM-Renderfixtures werden direkt an den Aktivierungs-/Rendercaller gegeben, nicht als gültiger Katalog importiert; separate echte Dateiinput-Kontrollen verlangen Grössen- und SHA256-Verweigerung. Profil, Importgate und WebCrypto bleiben unverändert. Diese Tests sind über die bestehende `tests/*.test.mjs`-Registrierung und Syntaxprüfung eingebunden; der öffentliche Dateisatz bleibt unverändert.
- `tests/browser.mjs`: separate Registrierung `npm run test:browser` (Build zuerst), externe ESM-`PLAYWRIGHT_MODULE`/Firefox-`BROWSER_EXECUTABLE`, optional `LOCAL_CATALOG_FILE` oder vorhandene `.local/catalog.json`. 20 native Fälle, davon drei ausdrücklich optionale private Fälle. Die bisherigen 19 Geschäftsfälle samt Reihenfolge und Assertions bleiben bytegleich; hinzu kommt als Fall 20 ausschliesslich die Q01-Reihenfolge: echter Dateiinput, gehaltenes originales File.text, tatsächlicher Saved-Recovery-Klick, späte Originallieferung, unveränderte Vorschau/Dirty-Draft/Raw und echte Übernahme als ungespeicherter Saved-Entwurf. Der DOM-Listeneradapter beobachtet zusätzlich das Promise des unverändert einmal aufgerufenen ursprünglichen Change-Handlers; Fall 20 verwendet keine Sleeps oder Frame-Drains als Abschlussbeweis. Erschöpfende Positions-/Originaldetailprüfung (1 388 + 314) und alle neun Tabellen mit 771 Zeilen und sämtlichen 2 056 Originalzellen; unabhängiges Python-Decimal-Orakel mit acht Vektoren. Navigation und vier responsive Ansichten inklusive Details/Rechnerunterkante, Font-/Overflow-Messung und Druckmedium. Jeder Hilfstab erhält dieselben Fehlerkollektoren, leere Fehler-Allowlist und acht exakte Fremdnamespace-Sentinels. Eigene Ressourcen werden in `finally` geschlossen. Private Evidenz unter `.local/browser/RUN-…/report.json` mit settled Fallzahlen/Versionen/Hashes/Downloads/Pixels. `--list` und `--self-test` prüfen offline Registrierung/Orakel, starten weder Browser noch Server und beanspruchen keine bestandenen nativen Fälle.

Die Originaldaten-Integrationstests sind bewusst optional, damit der öffentliche Checkout keine unzulässig verteilten Quellen benötigt. Der ursprüngliche Import wurde mit den echten gepinnten Originalen geprüft; die Nachfolger übernehmen die unveränderten Daten-/Profilbytes. Keine Testfixture gibt erfundene Daten als echten Tarif aus. Browserpixel und echte native Bedienabnahme sind eine separate Prüfebene, nicht durch Unit-Tests ersetzt.

Historischer nativer R1-Befund: tatsächlich 19 Fälle ausgeführt, davon 5 bestanden und 14 fehlgeschlagen; keine übersprungen/nicht ausgeführt, leere Fehlerkanäle und vollständiger eigener Ressourcenabbau. Sieben Fehler betrafen das tatsächlich fehlende Positions-`option`-Starttag im Produkt, sechs die unsortierten erwarteten Download-Key-Arrays und einer die fehlende Erwartung „Offizielle Quellen“ samt Quelllistentext. R1 ist damit kein PASS. R2/native-v2 repariert genau dieses HTML-Tag und nur diese beiden Beobachterfehler: beide Key-Seiten werden sortiert, der zusätzliche Quellen-Detailabschnitt wird vollständig erwartet und die exakten Quellanker-Assertions bleiben erhalten. Domain samt den drei Primitiv-Modusguards, App, CSS, Konverter, Preise und Daten-/Rechtegrenzen bleiben unverändert.

Zur historischen R2-Vorbereitung gehören ein echter HTML-RED am unveränderten R1-Index und derselbe neue registrierte Test am GREEN-Index. Der HTML-Test prüft Markup, nicht native Interaktion. Bei dieser Vorbereitung wurde kein Browser gestartet; lediglich die Suite offline syntaktisch/als Fallliste geprüft. Das beschreibt diesen Vorbereitungsschritt, keinen aktuellen Status einer späteren nativen Ausführung und keine unabhängige Freigabe. Spätere native Befunde benötigen einen eigenen Laufbeleg.

### R3: fachliche Rundungsreferenz (RC-01)

Nur `summary` und `detail` des öffentlichen Eintrags `round` werden präzisiert: Die Release notes beschreiben zweistellige Taxpunkte; die gepinnte XLSX enthält dennoch längere numerische XML-Rohwerte. Der lokale Konverter rundet ausdrücklich mit `Decimal/ROUND_HALF_UP` je AL-/IPL-Komponente auf zwei Nachkommastellen; `raw` bleibt die unveränderte Originalzelle, `decimal` ist die gerundete Rechenbasis. Der Pin bleibt `1.4c_260402`. Bei Widersprüchen ist laut Original die offizielle Datenbank Master; ein Abgleich aller Positionen gegen sie ist nicht implementiert. Es werden weder Preise noch Formel, Profil, Originale oder App-/Browserlogik geändert.

In `tests/domain.test.mjs` sind ausschliesslich neue RC-01-Fälle angehängt; alle bisherigen Tests bleiben unverändert. Zwei immer ausgeführte Textverträge prüfen Zuschreibung und Rohwertdiskrepanz bereits in der eigenständig sichtbaren Kurzreferenz sowie die getrennten Detailaussagen einschliesslich Datenbankgrenze. `TARIFF_REFERENCE_FILE` überschreibt **nur für diese beiden neuen Fälle** optional die Referenzdatei, standardmässig die eigene `public/data/reference.json`. Dadurch können identische finale Testbytes am echten unveränderten OLD-Text fachlich scheitern und am korrigierten Text bestehen; ein Lade-/Modulfehler zählt nicht als RED. Dies ist keine reine JSON-/DOM-Gleichheitsprüfung.

Ein dritter RC-01-Fall liest optional die echte `.local/catalog.json`, prüft deren vollständige Hash-/Schemaidentität und berechnet für jede numerische Komponente die zweistellige HALF_UP-Erwartung unabhängig mit Ziffern/BigInt, ohne Konverter oder Preisfunktion aufzurufen. Er verlangt tatsächlich bedeutsame TARDOC-Rohziffern jenseits der zweiten Stelle; reale Codes oder Werte sind nicht als öffentliche Fixture eingebettet. Ohne Privatdatei ist dieser Fall ausdrücklich SKIP, nicht PASS. Der Test allein liest kein OOXML und beweist keine Masterdatenbankübereinstimmung. Der separate private RC-01-Prüfbeleg bindet echte XLSX-Zellen per unabhängiger ZIP/XML-Lesung an `raw`/`decimal` und Decimal-Rundung; die vorhandene optionale Python-Originalprüfung und ein echter byteidentischer Reimport sichern den unveränderten Katalog zusätzlich ab. Originale und alle Authoring-/Prüfartefakte bleiben ausserhalb des öffentlichen Dateisatzes und der acht Runtimeziele.

R3 beansprucht keine neue Nativeabnahme: Die historisch erhaltenen 19/19 Parent-Nativfälle gehören ausschliesslich zur eingefrorenen v2. `node tests/browser.mjs --list` führt nur Registrierung und Decimal-Orakel aus, keinen Browser. Neue native Abnahme, unabhängige SPEC-/QUALITY-Prüfung und Pages-/Remote-/Familiengates bleiben getrennt offen.

### Q01: gemeinsamer Saved-Recovery-Intent

Im Saved-Recovery-Clickhandler wird vor dem ersten neuen Speicherzugriff `cancelImport()` aufgerufen. Damit wird dieselbe Importgeneration wie bei Abbruch/Übernahme/Unload fortgeschaltet, das alte Pending verworfen und ein alter Dialog geschlossen. Erst danach wird der Saved-Wert validiert und als neue nichtmutierende Vorschau geöffnet. Auch ein beschädigter oder gesperrter Saved-Read entwertet somit ältere Datei-Erfolgs- und Fehlerfortsetzungen. Entwurf, Tarifrechnung, Quellen, Domain, Workspace-Schema und Speicherimplementierung ändern sich nicht. RC-01 bleibt unverändert geschlossen.

Diese Vorbereitung ist keine SPEC-/QUALITY- oder Releasefreigabe. Die historische Parent-Nativabnahme 19/19 CLI 0 gehört ausschliesslich zum eingefrorenen v3-Vorgänger, nicht zu diesen 20 authorierten Fällen. Die neue native Ausführung übernimmt separat der Parent; Offline-List/Self-Test belegen sie nicht.

## Vollständiger öffentlicher Quell-Dateisatz

Nur diese 30 Dateien sind für das öffentliche Repository vorgesehen (zuzüglich einer optional durch den Betreiber separat vergebenen Codelizenz; für Originaldaten gilt sie nicht):

```text
.github/workflows/pages.yml
.gitignore
DATA.md
README.md
docs/CODEBASE.md
index.html
package-lock.json
package.json
public/data/local-profile.json
public/data/provenance.json
public/data/reference.json
public/favicon.svg
scripts/acquire_sources.py
scripts/build.mjs
scripts/check.mjs
scripts/files.mjs
scripts/import_catalog.py
scripts/serve.mjs
scripts/source-pins.json
src/app.js
src/domain.js
src/styles.css
tests/browser.mjs
tests/build-server.test.mjs
tests/context-types.test.mjs
tests/domain.test.mjs
tests/helpers/import-platform.mjs
tests/import-intent.test.mjs
tests/test_import_catalog.py
tests/test_markup.py
```

Massgeblich ist die tatsächlich enumerierte Liste: 30 Dateien. Der Runtime-Build liefert nur die acht in `files.mjs` genannten Dateien aus. `sources/`, `.local/`, `dist/`, Stageordner, Python-Caches und `node_modules/` sind ignoriert. Das private Quelleninventar und lokale Prüfbefunde stehen separat unter `.local/IMPLEMENTATION.md`; diese und die neue RED/GREEN-/Browser-Evidenz gehören nicht ins Repository oder den Build.

## Offene Grenzen

Rechteklärung vor öffentlicher Vollspiegelung. Kein vollständiger Abgleich der zwei Dezimalstellen gegen die offizielle Masterdatenbank. Keine separate PDF-Klarstellungsdatenbank, LKAAT-, Trigger- oder Gruppierungslogik. Kein Live-Update und kein behaupteter vollständiger Fakturavalidator. Keine Publikation durch die lokale Implementierung.

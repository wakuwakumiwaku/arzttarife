# Daten, Quellen und Nutzungsgrenzen

Prüfstand: 22.10.2026. Die offiziellen 2026-Kataloge und die zugehörigen Verträge sind öffentlich erreichbar; die Quelle nennt das am 01.01.2026 eingeführte Gesamtsystem mit TARDOC und Ambulanten Pauschalen.[1]

## Rechtebefund: vollständige öffentliche Spiegelung nicht freigegeben

Öffentliche Erreichbarkeit ist keine Weiterveröffentlichungslizenz. Die rechtlichen Hinweise beanspruchen Schutz für Plattforminhalte und untersagen deren Reproduktion/Verbreitung ohne entsprechende Erlaubnis. Der dortige Geltungsbereich nennt die Softwarebereitstellungsplattform; daraus wird **nicht** abgeleitet, dass jede fachliche Tatsache geschützt wäre.[3]

Die gesonderten OAAT-Lizenzbedingungen nennen ausdrücklich maschinenlesbare Tarif- und Leistungskataloge, Grouperspezifikationen und Mappinglogiken als Lizenzmaterial (Ziff. 2). Ziffer 4.2 sieht ein nicht übertragbares Vertriebsrecht unter Bedingungen vor; Ziffer 5.4 begrenzt die Nutzung auf die Schweiz und Liechtenstein. Ziffer 7 enthält Vertraulichkeitspflichten, unter anderem für Grouperspezifikationen.[4]

**Konkreter Gap:** Keine dokumentierte Erlaubnis für eine frei weltweit abrufbare vollständige Kopie von A1/A2 samt Beschreibungen und Interpretationen. Es wurden keine Lizenzbedingungen rechtsgeschäftlich für einen Dritten akzeptiert, keine Registrierung und kein geschützter Softwareabruf vorgenommen. Für die öffentliche Vollspiegelung wäre eine Rechteklärung nötig. Die mögliche Schutzfreiheit einzelner amtlicher Tarifnormen, Codes oder Zahlen wird nicht als pauschale Freigabe des gesamten OAAT-Werks ausgelegt. Auch ein reiner massenhafter Punkte-/Code-Datensatz wird daher derzeit nicht ausgeliefert.

Öffentlich erscheinen nur eigene fachliche Zusammenfassungen, Quellenlinks, Quellmetadaten/Hashes und selbst geschriebene Werkzeuge. Originaldateien und vollständige Ableitungen sind ausgeschlossen. Der lokale Import ist nur für Nutzer mit eigener Nutzungsbefugnis gedacht; er erweitert keine Rechte und überträgt keine Dateien an einen Server. Das ist eine vorsichtige Produktgrenze, keine verbindliche juristische Beurteilung.

## Öffentlicher Datensatz

`public/data/reference.json`: 16 eigene fachliche Referenzen mit neun offiziellen Quellzielen und konkreten Quellverknüpfungen je Eintrag. Sie behandeln Rechenbasis, TPW, Systemwechsel, Fallbildung, Groupergrenze, eingeschlossene Leistungen, Voraussetzungen und Versions-/Rundungsfragen. **Null eingebettete Tarifpositionen.** Taxpunkte und verhandelter TPW sind getrennt; eine nationale Preisableitung ist nicht vorgesehen.[1][2]

`public/data/provenance.json`: URLs, endgültige URLs, Abrufzeitpunkte, Dateigrössen und SHA256 für zwölf tatsächlich gesicherte öffentliche Originale. Die vollständigen HTTP-Header liegen nur neben den Originalen in ignoriertem `sources/`. Die Übersichtsseite und FAQ wurden als Quellen gelesen, nicht nur Suchausschnitte. `local-profile.json` enthält ausschliesslich Importidentität, Mengen, Dateigrösse und Hash, keine Katalogtexte.

## Gepinnter lokaler Katalog

| Eigenschaft | TARDOC | Ambulante Pauschalen |
| --- | --- | --- |
| Original | A2 Katalog des TARDOC 1.4c | A1 Katalog der Ambulanten Pauschalen v1.1c |
| Edition im Original | 1.4c_260402 | 1.1c |
| Gültig ab | 01.01.2026 | 01.01.2026 |
| Stand laut Vertragsübersicht | 02.04.2026 | 05.11.2025 |
| Tatsächlich gelesene Positionszeilen | 1 388 | 314 |
| Numerische Komponenten | 2 748 AL-/IPL-Zellen | 310 Punktwerte |
| Leere/offene Komponenten | 28 leere AL-/IPL-Zellen in 14 Positionen | 4 ausdrücklich unbewertete Positionen |

Die veröffentlichten Stände stammen von der offiziellen Übersichtsseite. Das A1-interne Blatt nennt einen älteren Exportstand; dieser wird nicht mit dem Freigabestand der Webseite gleichgesetzt. Der Positionsumfang wurde aus den tatsächlichen XLSX-Zeilen ermittelt, ohne formatierte Leerzeilen mitzuzählen. Die FAQ bestätigt die 314 Pauschalen für Version 1.1.[1][2]

Original-URLs und gepinnte SHA256 stehen in `scripts/source-pins.json` sowie `public/data/provenance.json`. Der Konverter prüft zuerst Bytezahl und Hash, danach Sheetstruktur, literal gültige Codes, Eindeutigkeit und exakte Sollmengen. Er rekonstruiert keine fehlenden Codes und normalisiert keine Literal-IDs. Numerisch gespeicherte Vorgängerfelder bleiben als rohe Zeichenfolge sichtbar; eine verlorene Excel-Anzeigeformatierung wird nicht in angeblich exakte TARMED-Codes umgeschrieben.

Enthaltene Begleittabellen (neun): TARDOC-Inhalt, Allgemeine Definitionen, Generelle Interpretationen, Kapitel, Kapitelinterpretationen, Sparten, Qualitative Dignitäten, Leistungsgruppen sowie Pauschalen-Inhalt. Alle nichtleeren Zeilen und Zellen bleiben erhalten; OOXML-Zeilenumbrüche werden dekodiert. Positionsbezeichnungen, Interpretationen/Hinweise und alle weiteren nichtleeren Originalfelder werden im privaten Paket übernommen. HTML/Markdown aus dem Original wird im Browser sicher als Text angezeigt, nicht als aktives HTML ausgeführt.

**Nicht enthalten:** LKAAT, Triggerliste, Grouperlogik/Entscheidbäume, TarifMatcher und separat publizierte PDF-Klarstellungen. Einige Klarstellungen auf der Vertragsseite sind auf 08.09.2026 datiert und müssen dort zusätzlich geprüft werden. Der offizielle Browser enthält weitere Ansichten, insbesondere das Definitionshandbuch.[1][5]

## Rechenbasis und festgestellte Quelldiskrepanz

Die Release notes vom 02.04.2026 erklären, dass das aktualisierte Excel Taxpunkte auf zwei Nachkommastellen enthalte, um zum Browser bzw. zur Datenbank zu passen. Das **tatsächlich erworbene, gepinnte XLSX** enthält dennoch in vielen Zellen längere numerische XML-Rohwerte. Diese werden nicht stillschweigend als bereits zweistellig ausgegeben.

Der Konverter verwendet ausdrücklich `Decimal` und `ROUND_HALF_UP` auf zwei Dezimalstellen **je AL-/IPL-Komponente bzw. Pauschalenwert**, passend zur in den Release notes genannten Rechen-/Anzeigebasis. Die Originalzelle bleibt unverändert in `raw` enthalten und wird separat im Detaildialog sichtbar. `decimal` ist die dokumentierte gerundete Rechenbasis, keine Behauptung über die gespeicherte XML-Präzision. Laut A2-Inhaltsblatt ist bei Widersprüchen die offizielle Datenbank die Masterversion. Eine Abgleichprüfung aller Positionen gegen diese Datenbank ist hier nicht implementiert. Damit ist der lokale Browser eine nachvollziehbare Referenz, keine zertifizierte Abrechnungsdatenbank.

Der öffentliche Rechner verlangt vom Nutzer AL/IPL oder bereits bestimmte Pauschalenpunkte und einen eigenen TPW. Er multipliziert Werte und ganzzahlige Menge exakt mit BigInt-Festkomma und rundet **einmal den Gesamtbetrag** kaufmännisch auf Rappen. Deshalb kann eine Mengenberechnung von der Summe einzeln gerundeter Rechnungszeilen abweichen. Importierte Komponenten sind zuvor bereits wie oben auf zwei Stellen aufbereitet. Fehlend/unbewertet bleibt unberechenbar; eine fehlende Einzelkomponente wird niemals als null ergänzt.

Dies ist keine Prüfung von Abrechnungsfähigkeit, Fakturaregeln, Mengenlimitationen, Zuschlagsbasen, Dignität oder Erstattung. Es wird keine Pauschale aus Diagnosen oder Leistungsbeschreibungen ermittelt; hierfür ist die offizielle Gruppierungslogik massgeblich.[2]

## Reproduzierbarkeit und Privatgrenze

- `acquire_sources.py --acknowledge-local-use`: nur gepinnte öffentliche XLSX-URLs. Original vor Verarbeitung sichern; HTTP-Header, Abruf, endgültige URL, Bytes, SHA256 daneben. Abweichende neue Bytes bleiben als `.unrecognized` getrennt erhalten, ohne vorhandene richtige Originale zu ersetzen.
- `import_catalog.py`: kein Netzwerk; nur übereinstimmende Originale. Ausgabe ausschliesslich unter ignoriertem `.local/` oder `sources/` möglich. Keine Option zum direkten Publizieren.
- Browser prüft bei lokalem JSON zuerst tatsächliche UTF-8-Bytezahl und SHA256 des gesamten Pakets gegen das veröffentlichte Profil, dann alle Objektfelder, Werte, IDs, Mengen und Quellenidentitäten. Das Paket wird erst nach Vorschau übernommen. Ein Hash ist keine OAAT-Signatur; er bindet die lokale Ausgabe an diesen geprüften Importlauf.
- Der ursprüngliche Header-/Quellbestand wird nicht gebaut oder per HTTP ausgeliefert. Die Runtime-Allowlist hat exakt acht Dateiziele. Arbeitsstand-JSON enthält keine Katalogtexte.
- Die registrierte native Suite verwendet denselben privaten Hash-/Byte-Pin ausschliesslich über den echten lokalen Dateiinput. Ihr privater Datenumfang ist kein öffentlicher Laufzeitbestand. Fehlt die Fixture, werden die drei privaten Browserfälle ausdrücklich übersprungen. Historie: R1/native-v1 wurde nativ ausgeführt (5/19 bestanden, 14 fehlgeschlagen, keine übersprungen/nicht ausgeführt); die R2/native-v2-Vorbereitung startete keinen Browser. Diese Historie ist keine aktuelle native Freigabe. Details stehen in README/CODEBASE und den jeweiligen separaten Laufbelegen. Öffentliche Daten-, Provenienz-, Profil- und Konverterbytes bleiben unverändert.

## Sources

[1] https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge
[2] https://oaat-otma.ch/gesamt-tarifsystem/faq
[3] https://oaat-otma.ch/rechtliche-hinweise
[4] https://oaat-otma.ch/gesamt-tarifsystem/tarifkomponenten/lizenzbedingungen
[5] https://oaat-otma.ch/tardoc/tarifbrowser

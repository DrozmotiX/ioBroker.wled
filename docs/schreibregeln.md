# Schreibregeln für die WLED-Dokumentation

Diese Regeln gelten für alle Seiten unter `docs/de` und später `docs/en`. Sie gehören nicht zur veröffentlichten Doku, sondern zur Arbeit daran.

## 1. Grundsätze

1. **Der Titel ist die Frage der Nutzer.** Jede Abschnittsüberschrift (`##`) ist eine Frage, so wie Nutzer sie im Forum oder in Issues stellen. Die Fragen stehen schon im Gerüst. Ändere den Wortlaut nur, wenn er missverständlich ist, und schreibe den Grund in die Commit-Nachricht.
2. **Jede Aussage hat eine Quelle.** Belegt wird mit einer Code-Stelle, einem Issue oder einem Forenbeitrag (Format in Abschnitt 4). Eine Aussage ohne Quelle wird nicht geschrieben, sondern als offene Frage notiert.
3. **Versionen stehen ausdrücklich da.** Was erst ab einer bestimmten Version gilt, bekommt einen sichtbaren Hinweis (Abschnitt 5).
4. **Deutsch ist maßgeblich.** Deutsch wird zuerst geschrieben und abgenommen. Englisch folgt inhaltsgleich, bewusst geschrieben und nicht maschinell übersetzt.
5. **Nur Markdown, das auf GitHub und auf der Doku-Seite (VuePress 2) gleich aussieht** (Abschnitt 6).

## 2. Woher die Inhalte kommen

Die Arbeitsdaten liegen im Ordner `docs-project/` (nicht im Git):

| Datei | Wofür |
|---|---|
| `analysis/doc-outline.md` / `.json` | Gliederung: Seiten, Abschnitte, Priorität, was jeder Abschnitt beantworten muss |
| `analysis/clusters.json` | Zu jedem Bündel die geprüfte Antwort (DE/EN), Belege und die Fragen-IDs |
| `analysis/interview-answers.md` | **Entscheidungen des Entwicklers. Bei Widerspruch gilt diese Datei.** |
| `analysis/code-findings.md` | Bekannte Fehler im Code mit Datei und Zeile |
| `inventory/features.json` | Alle Funktionen mit Code-Stelle und Stolperfallen |
| `corpus/questions.json` | Die Originalfragen mit Link zum Forenbeitrag oder Issue |
| `issues/issue-entwuerfe.md` | Welche Fehler und Funktionen in welcher Version kommen, mit Issue-Nummern |

Jeder Abschnitt im Gerüst trägt zwei unsichtbare Kommentare: `abschnitt:` mit Cluster- und Feature-IDs und `muss beantworten:` mit dem Pflichtinhalt. Beide bleiben stehen. Über die Feature-IDs prüft später ein Skript bei jedem Release, ob sich die belegten Code-Stellen geändert haben.

## 3. Aufbau der Seiten

- **Ordner und Dateien** sind nummeriert, z. B. `01.erste-schritte/01.installation.md`. Jeder Ordner hat eine `README.md` als Inhaltsseite.
- **Eine Seite** hat genau eine Überschrift `#` (Seitentitel). Jeder Abschnitt beginnt mit einer Überschrift `##` (die Nutzerfrage). Unterpunkte nutzen `###`, tiefer geht es nicht.
- **Jeder Abschnitt hat einen festen Anker** direkt vor der Überschrift, z. B. `<a id="add-device-manually"></a>`. Der Anker ist englisch, ändert sich nie und ist in `de` und `en` gleich. Links auf Abschnitte nutzen immer diesen Anker, nie die automatisch erzeugte Überschriften-ID.
- **Reihenfolge im Abschnitt** (siehe [Abschnittsvorlage](vorlage-abschnitt.md)): zuerst die kurze Antwort, dann die Schritte, dann Hinweise und Versionen, zuletzt „Siehe auch".
- **Abschnitte bleiben eigenständig.** Wer über die Suche auf einem Abschnitt landet, muss ihn ohne die Abschnitte davor verstehen. Wiederholungen ersetzt man durch einen Link.

## 4. Quellen angeben

Die Quelle steht als unsichtbarer Kommentar direkt unter dem Absatz, der Liste oder der Tabelle, die sie belegt:

```markdown
Wird ein Gerät nicht automatisch gefunden, fügst du es über seine IP-Adresse hinzu.
<!-- quelle: code=main.js:513@v0.9.2; issue=#123; forum=603844 -->
```

| Art | Schreibweise | Bedeutung |
|---|---|---|
| Code | `code=main.js:1234@v0.9.2` | Datei und Zeile im Grundstand |
| Issue / PR | `issue=#640`, `pr=#1238` | Issue oder Pull Request in `DrozmotiX/ioBroker.wled` |
| Forum | `forum=603844` | Beitrag `https://forum.iobroker.net/post/603844` |
| Entscheidung | `interview=13b` | Antwort im Entwickler-Interview |
| Fremdquelle | `extern=WLED:wled00/json.cpp:470@v0.15.0` | Datei (und Zeile) in einem anderen Repository, Form `extern=<Repo>:<Pfad>[:<Zeile>]@<Version>`. Für die WLED-Firmware (`WLED`), die WLED-Doku (`WLED-Docs`, ohne Version) und den JavaScript-Adapter (`ioBroker.javascript`, z. B. Blockly-Begriffe) |

Mehrere Quellen werden mit `;` getrennt. Für Verhalten ab einer späteren Version ist das Issue oder der Pull Request die Quelle.

## 5. Versionen

- Die Doku beschreibt **v0.9.2** als Grundstand.
- Verhalten, das erst später gilt, steht als eigener Absatz mit fettem Anfang: `**Ab vX.Y.Z:** …`, mit Link auf das Issue.
- Für alte Fehler steht `**Bis vX.Y.Z:** …` und daneben, ab wann es behoben ist.
- Geplante Funktionen ohne Version werden nicht beschrieben. Höchstens ein Satz „ist geplant" mit Link zum Issue.
- Keine Formulierungen wie „neu", „demnächst", „in der aktuellen Version". Immer die Versionsnummer.

## 6. Erlaubtes Markdown

| Erlaubt | Verboten | Grund |
|---|---|---|
| Überschriften `#`, `##`, `###` | Frontmatter (`---` am Dateianfang) | GitHub zeigt es als Tabelle |
| Absätze, **fett**, *kursiv*, `Code` | `::: tip`, `::: warning` und andere Container | GitHub zeigt sie als Rohtext |
| Nummerierte und einfache Listen | Aufgabenlisten `- [ ]` | VuePress zeigt keine Kästchen |
| Tabellen | Fußnoten `[^1]` | VuePress kennt sie nicht |
| Codeblöcke mit Sprache (` ```json `) | Emoji-Kürzel `:warning:` | unterschiedlich dargestellt |
| GitHub-Hinweise `> [!NOTE]` usw. (siehe unten) | `[[toc]]`, Vue-Komponenten | nur VuePress |
| Relative Links auf `.md`-Dateien | `{{ … }}` außerhalb von Code | VuePress wertet es als Vorlage aus |
| Bilder mit relativem Pfad, `<a id="…"></a>`, `<!-- … -->` | anderes HTML (`<details>`, `<br>`, `<div>`) | uneinheitlich |

**Hinweisblöcke** sind GitHub-Alerts. Es gibt genau fünf Arten:

| Art | Wofür |
|---|---|
| `> [!NOTE]` | Ergänzende Information |
| `> [!TIP]` | Abkürzung oder bessere Variante |
| `> [!IMPORTANT]` | Muss man wissen, damit es klappt |
| `> [!WARNING]` | Kann Daten oder Werte verfälschen |
| `> [!CAUTION]` | Kann Daten unwiederbringlich löschen |

GitHub zeigt sie farbig. Die Doku-Seite braucht dafür VuePress 2 mit `@vuepress/plugin-markdown-hint` (`alert: true`); unter VuePress 1 erscheinen sie nur als Zitat.

Weitere Punkte:

- **Links** sind relativ und enden auf `.md`, z. B. `[Gerät hinzufügen](../01.erste-schritte/02.erstes-geraet.md#add-device-manually)`.
- **In Kommentaren** nie zwei Bindestriche hintereinander schreiben, sonst endet der Kommentar zu früh.
- **Bilder** liegen im Ordner des Teils unter `img/` und haben einen Alternativtext. Screenshots entstehen in Phase 5. Bis dahin steht dort `<!-- bild: was das Bild zeigen soll -->`.

## 7. Sprache und Stil

- Die Leser werden mit **du** angesprochen, wie im ioBroker-Forum üblich.
- Kurze Sätze, ein Gedanke pro Satz. Fachbegriffe beim ersten Auftreten kurz erklären.
- **Begriffe aus der Oberfläche** stehen genau so da, wie der Admin sie auf Deutsch anzeigt, in Anführungszeichen.
- **State-IDs, Objektnamen und Werte** stehen als `Code`: `wled.0.<Gerät>.<State>`.
- Platzhalter in spitzen Klammern: `<Gerät>`, `<Segment>`.
- Zahlen mit Einheit und Leerzeichen. In Code-Beispielen gilt die Schreibweise des Codes.

## 8. Datenschutz

Keine Benutzernamen, Geräte-IDs, IP- oder MAC-Adressen, auch nicht aus Forenbeiträgen. In Beispielen Platzhalter wie `192.168.x.y` oder `<MAC>`. Forenbeiträge werden nur über ihre Nummer zitiert, Inhalte sinngemäß wiedergegeben.

## 9. Ablauf beim Schreiben

1. Ein Schreib-Thread bekommt eine oder mehrere **ganze Seiten**. Nur diese Dateien werden geändert.
2. Inhaltsseiten (`README.md`), Anker und Abschnittstitel ändert nur, wer das Gerüst pflegt.
3. **Ein Commit je Abschnitt**, Nachricht `docs(de): <Seite> – <Frage gekürzt>`.
4. Fertige Abschnitte ersetzen die Zeile *Dieser Abschnitt wird noch geschrieben.*
5. Offene Fragen an den Entwickler stehen im Pull Request, nicht in der Doku.
6. Englisch wird erst geschrieben, wenn der Entwickler die deutsche Fassung abgenommen hat, unter `docs/en` mit denselben Datei- und Ankernamen.

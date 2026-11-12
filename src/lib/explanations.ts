import { fill } from "../i18n/fill";
import type { Locale } from "../i18n/locales";
import type { CheckExplanation, CheckNote, CheckResult } from "../types/audit";

type Ask = "transport" | "money" | "quantity" | "date" | "other";

interface Phrases {
  orderClosed: string;
  orderOpen: string;
  blankSignature: string;
  paymentPurpose: string;
  completionLetter: string;
  completionMissing: string;
  shipmentOne: string;
  shipmentMany: string;
  shipmentNone: string;
  remainder: string;
  reportVsDoc: string;
  valuesDisagree: string;
  quantityCollected: string;
  netClause: string;
  moneyDisagree: string;
  moneyCollected: string;
  newerDocument: string;
  formulaBlank: string;
  exactText: string;
  partialReadValue: string;
  textSeen: string;
  damagedField: string;
  needsModel: string;
  notFoundRole: string;
  askTransport: string;
  askMoney: string;
  askQuantity: string;
  askDate: string;
  askOther: string;
  itemListed: string;
  conflict: string;
  sourceConfirms: string;
  notFound: string;
  withinTolerance: string;
  mismatchDetail: string;
  deltaReport: string;
  shipmentsTotal: string;
  shipmentsMore: string;
  modelLabels: string;
  modelUnavailable: string;
  modelOther: string;
  modelNotOperation: string;
  modelCompared: string;
  deltaSource: string;
  deltaSum: string;
  modelUnparsed: string;
  modelMatch: string;
  modelSumOpen: string;
  modelSumKept: string;
  modelSummed: string;
  cited: string;
  citeMissing: string;
  modelOmitted: string;
  calculated: string;
  insufficient: string;
  selectedFound: string;
  selectedMissing: string;
  editedUnparsed: string;
  editedMatch: string;
  editedDiff: string;
  deltaShort: string;
  fallbackMismatch: string;
  deltaComma: string;
  fallbackMissing: string;
  fallbackReview: string;
  fallbackMatch: string;
}

const ru: Phrases = {
  orderClosed: "Принятое количество закрывает заказ по договору.",
  orderOpen: "Принятое количество меньше заказанного по договору, поэтому заказ ещё не закрыт.",
  blankSignature: "В отчёте для «{label}» указано «{report}», но в документе строка подписи не заполнена (оставлено место для подписи). Это не подтверждает и не опровергает подлинность.",
  paymentPurpose: "Сумма платежа № {number} есть в комплекте, но его назначение не содержит договор {contract}. Отнести платеж к этому договору по одному только отчету нельзя.",
  completionLetter: "«{label}» отмечено как завершенное, но подтверждающий протокол или акт с этим идентификатором не найден. Письмо о готовности не заменяет итоговый документ.",
  completionMissing: "Для «{label}» в комплекте нет акта или протокола. Счет или переписка сами по себе не подтверждают выполнение.",
  shipmentOne: "В комплекте 1 поставка: {names}. Повтор одного файла не считается второй поставкой.",
  shipmentMany: "В комплекте {count} поставки: {names}. Повтор одного файла не считается второй поставкой.",
  shipmentNone: "Накладная поставки в комплекте не найдена.",
  remainder: "Остаток — это количество по договору минус принятое за период: {value}.",
  reportVsDoc: "В отчёте {report}, в «{document}» — {source}.",
  valuesDisagree: "По «{label}» документы называют разные значения: {parts}. В отчёте указано {report}. По комплекту нельзя выбрать одно из них.",
  quantityCollected: "Количество собрано по документам одной операции{net}: {parts}. Итого {total}.",
  netClause: " за вычетом возврата",
  moneyDisagree: "По «{label}» документы называют разные суммы: {parts}. В отчёте указано {report}. По комплекту нельзя выбрать одну из них.",
  moneyCollected: "Сумма собрана из строк одной операции{net}: {parts}. Итого {total}.",
  newerDocument: "Более новый документ имеет приоритет. Более ранние не вошли в расчёт: {earlier}.",
  formulaBlank: "В отчёте для «{label}» формула без сохранённого результата. Пустое значение не принято за ноль. Откройте файл в редакторе и сохраните вычисленные значения.",
  exactText: "Совпадает по точному тексту.",
  partialReadValue: "Подтверждение «{label}» не найдено в прочитанных документах. Проверка неполная: {detail} В непрочитанном файле могло быть подтверждение.",
  textSeen: "«{value}» встречается в {documents}.",
  damagedField: "В «{document}» есть поле «{label}», но значение не прочитано: документ сообщает о повреждении. План или договор не заменяют нечитаемый факт.",
  needsModel: "Формулировка «{label}» не сопоставлена однозначно. Для смыслового сравнения нужен ключ языковой модели (AI_API_KEY или LOVABLE_API_KEY) либо ручная проверка.",
  notFoundRole: "В прочитанном комплекте нет подтверждения «{label}» ({value}). {ask} Посторонние документы с другими операциями не использованы.",
  askTransport: "Запросите счёт, акт или платёжный документ на перевозку.",
  askMoney: "Запросите акт, накладную или счёт по этой поставке.",
  askQuantity: "Запросите накладную или акт с количеством по этой позиции.",
  askDate: "Запросите документ с датой этой операции.",
  askOther: "Запросите первичный документ, в котором есть это значение.",
  itemListed: "«{value}» есть в перечне наименований первичных документов. Остальные строки этого перечня — другие позиции.",
  conflict: "По «{label}» первичные документы противоречат друг другу: {parts}. В отчёте указано {report}. Нужно уточнить, какой документ относится к этой операции.",
  sourceConfirms: "Источник по той же операции подтверждает «{label}».",
  notFound: "Подтверждение «{label}» не найдено.",
  withinTolerance: "Источник подтверждает «{label}» в пределах указанного допуска.",
  mismatchDetail: "В отчёте {report}, в «{document}» — {source}.{delta} Уточните «{label}» и при необходимости запросите исправленный документ.",
  deltaReport: " Разница {delta} (отчёт минус первичный документ).",
  shipmentsTotal: "Позиция складывается из поставок: {parts}. Итого {total}. Повтор одного и того же документа в сумму не входит.{more}",
  shipmentsMore: " Уточните, все ли частичные поставки приложены.",
  modelLabels: "Языковая модель определила смысл подписи {labels}; значения разобраны и сравнены кодом.",
  modelUnavailable: "Запрос к модели не выполнен, оставлено ограничение.",
  modelOther: "Модель указала другой фрагмент в «{document}»: «{quote}». Автоматический статус не изменён.",
  modelNotOperation: "Модель указала фрагмент в «{document}»: «{quote}». Это не документ о совершённой операции, поэтому автоматический статус не закрыт.",
  modelCompared: "Модель указала фрагмент в «{document}», сервер сверил значение отчёта {report} с цитатой «{quote}».{difference}",
  deltaSource: " Разница {difference} (отчёт минус источник).",
  deltaSum: " Разница {difference} (отчёт минус сумма источников).",
  modelUnparsed: "Модель указала фрагмент в «{document}», но сервер не смог разобрать цитату «{quote}» как то же значение, что в отчёте. Нужна ручная проверка.",
  modelMatch: "Модель указала фрагмент в «{document}». Сервер проверил, что цитата есть в этом фрагменте и совпадает со значением отчёта.",
  modelSumOpen: "Модель указала {count} источников: {listed}. Сервер не закрыл строку по этой сумме.",
  modelSumKept: "Модель указала {count} источников: {listed}. Автоматический статус не изменён.",
  modelSummed: "Модель указала {count} источников: {listed}. Сервер сложил их и сверил с {report}.{difference}",
  cited: "Сервер сверил «{name}» с {count} цитатами из первичных документов.",
  citeMissing: "Для «{name}» в первичных документах не найдена цитата, которая есть в указанном фрагменте.",
  modelOmitted: "Модель не выделила «{label}». Строка добавлена из правил и оставлена на ручную проверку, без статуса «совпадает».",
  calculated: "Модель решила, какие документы входят в расчёт. Сервер сложил включённые части: {formula} = {total}. В отчёте {report}.{difference}",
  insufficient: "«{name}» — внутренняя разбивка без отдельного документа. Строка оставлена непроверенной.",
  selectedFound: "Проверяющий выделил «{text}» после разбора. Сервер нашёл {count} источников и сверил их с выделенным текстом.",
  selectedMissing: "Проверяющий выделил «{text}» после разбора. В первичных документах подтверждение не найдено.",
  editedUnparsed: "В отчёт записано «{value}». Сравнить с источником как число не удалось.",
  editedMatch: "В отчёт записано значение источника: {value}. Расхождение снято.",
  editedDiff: "В отчёт записано {value}. Источник по-прежнему {source}.{delta}",
  deltaShort: " Разница {delta}.",
  fallbackMismatch: "Значение в отчёте ({report}) не совпадает с первичным документом ({source}){delta}.",
  deltaComma: ", расхождение {delta}",
  fallbackMissing: "Подтверждающий документ для значения {value} не найден.",
  fallbackReview: "Автоматическая проверка не дала однозначного результата, требуется ручная проверка.",
  fallbackMatch: "Совпадает.",
};

const en: Phrases = {
  orderClosed: "The quantity received covers the order under the contract.",
  orderOpen: "The quantity received is below the quantity ordered under the contract, so the order is not yet closed.",
  blankSignature: "The report says «{report}» for «{label}», but the signature line in the document is blank. That neither confirms nor denies authenticity.",
  paymentPurpose: "Payment no. {number} is in the pack, but its purpose does not mention contract {contract}. The report alone cannot assign this payment to that contract.",
  completionLetter: "«{label}» is marked complete, but no certificate or acceptance act with this identifier was found. A readiness letter does not replace the final document.",
  completionMissing: "The pack has no acceptance act or certificate for «{label}». An invoice or correspondence alone does not confirm completion.",
  shipmentOne: "The pack contains 1 delivery: {names}. Uploading the same file again does not count as another delivery.",
  shipmentMany: "The pack contains {count} deliveries: {names}. Uploading the same file again does not count as another delivery.",
  shipmentNone: "No delivery note for this shipment was found in the pack.",
  remainder: "The remainder is the contract quantity minus what was accepted in the period: {value}.",
  reportVsDoc: "The report shows {report}; «{document}» shows {source}.",
  valuesDisagree: "Documents give different values for «{label}»: {parts}. The report shows {report}. The pack does not decide between them.",
  quantityCollected: "The quantity is taken from documents of one operation{net}: {parts}. Total {total}.",
  netClause: ", net of returns",
  moneyDisagree: "Documents give different amounts for «{label}»: {parts}. The report shows {report}. The pack does not decide between them.",
  moneyCollected: "The amount is taken from lines of one operation{net}: {parts}. Total {total}.",
  newerDocument: "The newer document takes priority. Earlier ones were left out of the calculation: {earlier}.",
  formulaBlank: "The report formula for «{label}» has no stored result. The empty value was not treated as zero. Open the file in an editor and save the calculated values.",
  exactText: "Matches the exact text.",
  partialReadValue: "No confirmation of «{label}» was found in the documents that were read. The check is incomplete: {detail} The unread file may have contained the confirmation.",
  textSeen: "«{value}» appears in {documents}.",
  damagedField: "«{document}» has a field «{label}», but the value was not read: the document says it is damaged. A plan or a contract does not replace an unreadable fact.",
  needsModel: "The wording «{label}» was not matched unambiguously. A language-model key (AI_API_KEY or LOVABLE_API_KEY) or a manual review is required for a semantic comparison.",
  notFoundRole: "The documents that were read do not confirm «{label}» ({value}). {ask} Documents about other operations were not used.",
  askTransport: "Ask for an invoice, an acceptance act, or a payment document for the transport.",
  askMoney: "Ask for an acceptance act, a delivery note, or an invoice for this delivery.",
  askQuantity: "Ask for a delivery note or an acceptance act with the quantity for this item.",
  askDate: "Ask for a document with the date of this operation.",
  askOther: "Ask for a source document that contains this value.",
  itemListed: "«{value}» is in the item list of the source documents. The other lines of that list are different items.",
  conflict: "Source documents contradict each other on «{label}»: {parts}. The report shows {report}. Which document belongs to this operation still has to be decided.",
  sourceConfirms: "A source for the same operation confirms «{label}».",
  notFound: "No confirmation of «{label}» was found.",
  withinTolerance: "A source confirms «{label}» within the stated tolerance.",
  mismatchDetail: "The report shows {report}; «{document}» shows {source}.{delta} Check «{label}» and ask for a corrected document if needed.",
  deltaReport: " Difference {delta} (report minus source document).",
  shipmentsTotal: "The line is the sum of deliveries: {parts}. Total {total}. The same document is not added twice.{more}",
  shipmentsMore: " Check whether every partial delivery is attached.",
  modelLabels: "The language model identified the meaning of the label {labels}; the values were parsed and compared by the server.",
  modelUnavailable: "The model request did not complete, so the limitation stands.",
  modelOther: "The model pointed to another fragment in «{document}»: «{quote}». The automatic status was not changed.",
  modelNotOperation: "The model pointed to a fragment in «{document}»: «{quote}». This is not a document of a completed operation, so the automatic status was not closed.",
  modelCompared: "The model pointed to a fragment in «{document}», and the server compared the report value {report} with the quote «{quote}».{difference}",
  deltaSource: " Difference {difference} (report minus source).",
  deltaSum: " Difference {difference} (report minus the sum of the sources).",
  modelUnparsed: "The model pointed to a fragment in «{document}», but the server could not read the quote «{quote}» as the same value as in the report. Manual review is required.",
  modelMatch: "The model pointed to a fragment in «{document}». The server checked that the quote is in that fragment and matches the report value.",
  modelSumOpen: "The model named {count} sources: {listed}. The server did not close the row on this amount.",
  modelSumKept: "The model named {count} sources: {listed}. The automatic status was not changed.",
  modelSummed: "The model named {count} sources: {listed}. The server added them and compared the sum with {report}.{difference}",
  cited: "The server compared «{name}» with {count} quotes from the source documents.",
  citeMissing: "No quote that actually appears in the named fragment was found for «{name}».",
  modelOmitted: "The model did not list «{label}». The row was added from the rules and left for manual review, not closed as a match.",
  calculated: "The model chose which documents belong in the calculation. The server added the included parts: {formula} = {total}. The report says {report}.{difference}",
  insufficient: "«{name}» is an internal split with no document of its own. The row stays unchecked.",
  selectedFound: "The reviewer selected «{text}» after the check. The server found {count} sources and compared them with the selected text.",
  selectedMissing: "The reviewer selected «{text}» after the check. No confirmation was found in the source documents.",
  editedUnparsed: "«{value}» was written into the report. It could not be compared with the source as a number.",
  editedMatch: "The source value was written into the report: {value}. The discrepancy is cleared.",
  editedDiff: "{value} was written into the report. The source is still {source}.{delta}",
  deltaShort: " Difference {delta}.",
  fallbackMismatch: "The report value ({report}) does not match the source document ({source}){delta}.",
  deltaComma: ", difference {delta}",
  fallbackMissing: "No supporting document was found for {value}.",
  fallbackReview: "The automatic check was not conclusive, so a manual review is required.",
  fallbackMatch: "Matches.",
};

const de: Phrases = {
  orderClosed: "Die angenommene Menge deckt die Bestellung aus dem Vertrag.",
  orderOpen: "Die angenommene Menge liegt unter der bestellten Menge, daher ist der Auftrag noch nicht geschlossen.",
  blankSignature: "Für «{label}» steht im Bericht «{report}», aber die Unterschriftszeile im Dokument ist leer. Das bestätigt die Echtheit nicht und widerlegt sie auch nicht.",
  paymentPurpose: "Zahlung Nr. {number} liegt im Paket, ihr Verwendungszweck nennt aber den Vertrag {contract} nicht. Allein der Bericht kann die Zahlung diesem Vertrag nicht zuordnen.",
  completionLetter: "«{label}» ist als abgeschlossen markiert, aber ein Protokoll oder eine Abnahme mit dieser Kennung fehlt. Ein Bereitschaftsschreiben ersetzt das Abschlussdokument nicht.",
  completionMissing: "Für «{label}» gibt es im Paket keine Abnahme und kein Protokoll. Rechnung oder Schriftwechsel allein bestätigen die Ausführung nicht.",
  shipmentOne: "Das Paket enthält 1 Lieferung: {names}. Dieselbe Datei ein zweites Mal zählt nicht als weitere Lieferung.",
  shipmentMany: "Das Paket enthält {count} Lieferungen: {names}. Dieselbe Datei ein zweites Mal zählt nicht als weitere Lieferung.",
  shipmentNone: "Ein Lieferschein zu dieser Lieferung wurde im Paket nicht gefunden.",
  remainder: "Der Rest ist die Vertragsmenge abzüglich der im Zeitraum angenommenen Menge: {value}.",
  reportVsDoc: "Im Bericht steht {report}, in «{document}» steht {source}.",
  valuesDisagree: "Die Dokumente nennen für «{label}» verschiedene Werte: {parts}. Im Bericht steht {report}. Aus dem Paket lässt sich keiner davon auswählen.",
  quantityCollected: "Die Menge stammt aus Dokumenten eines Vorgangs{net}: {parts}. Summe {total}.",
  netClause: " abzüglich Rückgaben",
  moneyDisagree: "Die Dokumente nennen für «{label}» verschiedene Beträge: {parts}. Im Bericht steht {report}. Aus dem Paket lässt sich keiner davon auswählen.",
  moneyCollected: "Der Betrag stammt aus Zeilen eines Vorgangs{net}: {parts}. Summe {total}.",
  newerDocument: "Das neuere Dokument hat Vorrang. Frühere gingen nicht in die Rechnung ein: {earlier}.",
  formulaBlank: "Die Formel für «{label}» im Bericht hat kein gespeichertes Ergebnis. Der leere Wert wurde nicht als null gelesen. Öffnen Sie die Datei im Editor und speichern Sie die berechneten Werte.",
  exactText: "Stimmt mit dem genauen Text überein.",
  partialReadValue: "Eine Bestätigung für «{label}» wurde in den gelesenen Dokumenten nicht gefunden. Die Prüfung ist unvollständig: {detail} In der ungelesenen Datei kann die Bestätigung stehen.",
  textSeen: "«{value}» kommt in {documents} vor.",
  damagedField: "In «{document}» gibt es das Feld «{label}», der Wert wurde aber nicht gelesen: das Dokument meldet eine Beschädigung. Plan oder Vertrag ersetzen eine unlesbare Angabe nicht.",
  needsModel: "Die Formulierung «{label}» wurde nicht eindeutig zugeordnet. Für einen inhaltlichen Vergleich braucht es einen Modellschlüssel (AI_API_KEY oder LOVABLE_API_KEY) oder eine manuelle Prüfung.",
  notFoundRole: "In den gelesenen Dokumenten gibt es keine Bestätigung für «{label}» ({value}). {ask} Dokumente zu anderen Vorgängen wurden nicht verwendet.",
  askTransport: "Fordern Sie eine Rechnung, eine Abnahme oder einen Zahlungsbeleg für den Transport an.",
  askMoney: "Fordern Sie eine Abnahme, einen Lieferschein oder eine Rechnung zu dieser Lieferung an.",
  askQuantity: "Fordern Sie einen Lieferschein oder eine Abnahme mit der Menge zu dieser Position an.",
  askDate: "Fordern Sie ein Dokument mit dem Datum dieses Vorgangs an.",
  askOther: "Fordern Sie ein Primärdokument an, in dem dieser Wert steht.",
  itemListed: "«{value}» steht in der Positionsaufstellung der Primärdokumente. Die übrigen Zeilen dieser Aufstellung sind andere Positionen.",
  conflict: "Die Primärdokumente widersprechen sich bei «{label}»: {parts}. Im Bericht steht {report}. Welches Dokument zu diesem Vorgang gehört, ist noch zu klären.",
  sourceConfirms: "Eine Quelle zum selben Vorgang bestätigt «{label}».",
  notFound: "Eine Bestätigung für «{label}» wurde nicht gefunden.",
  withinTolerance: "Eine Quelle bestätigt «{label}» innerhalb der angegebenen Toleranz.",
  mismatchDetail: "Im Bericht steht {report}, in «{document}» steht {source}.{delta} Prüfen Sie «{label}» und fordern Sie bei Bedarf ein korrigiertes Dokument an.",
  deltaReport: " Differenz {delta} (Bericht minus Primärdokument).",
  shipmentsTotal: "Die Position setzt sich aus Lieferungen zusammen: {parts}. Summe {total}. Dasselbe Dokument geht nicht zweimal in die Summe ein.{more}",
  shipmentsMore: " Prüfen Sie, ob alle Teillieferungen beigefügt sind.",
  modelLabels: "Das Sprachmodell hat die Bedeutung der Beschriftung {labels} bestimmt; die Werte hat der Server gelesen und verglichen.",
  modelUnavailable: "Die Modellanfrage wurde nicht ausgeführt, die Einschränkung bleibt.",
  modelOther: "Das Modell hat auf ein anderes Fragment in «{document}» gezeigt: «{quote}». Der automatische Status wurde nicht geändert.",
  modelNotOperation: "Das Modell hat auf ein Fragment in «{document}» gezeigt: «{quote}». Das ist kein Dokument über einen abgeschlossenen Vorgang, daher wurde der automatische Status nicht geschlossen.",
  modelCompared: "Das Modell hat auf ein Fragment in «{document}» gezeigt, der Server hat den Berichtswert {report} mit dem Zitat «{quote}» verglichen.{difference}",
  deltaSource: " Differenz {difference} (Bericht minus Quelle).",
  deltaSum: " Differenz {difference} (Bericht minus Summe der Quellen).",
  modelUnparsed: "Das Modell hat auf ein Fragment in «{document}» gezeigt, aber der Server konnte das Zitat «{quote}» nicht als denselben Wert wie im Bericht lesen. Eine manuelle Prüfung ist nötig.",
  modelMatch: "Das Modell hat auf ein Fragment in «{document}» gezeigt. Der Server hat geprüft, dass das Zitat in diesem Fragment steht und mit dem Berichtswert übereinstimmt.",
  modelSumOpen: "Das Modell hat {count} Quellen genannt: {listed}. Der Server hat die Zeile mit dieser Summe nicht geschlossen.",
  modelSumKept: "Das Modell hat {count} Quellen genannt: {listed}. Der automatische Status wurde nicht geändert.",
  modelSummed: "Das Modell hat {count} Quellen genannt: {listed}. Der Server hat sie addiert und mit {report} verglichen.{difference}",
  cited: "Der Server hat «{name}» mit {count} Zitaten aus den Primärdokumenten verglichen.",
  citeMissing: "Für «{name}» wurde kein Zitat gefunden, das im angegebenen Fragment tatsächlich steht.",
  modelOmitted: "Das Modell hat «{label}» nicht genannt. Die Zeile kommt aus den Regeln und bleibt zur manuellen Prüfung, nicht als Übereinstimmung.",
  calculated: "Das Modell hat entschieden, welche Dokumente in die Berechnung gehören. Der Server hat die einbezogenen Teile addiert: {formula} = {total}. Im Bericht steht {report}.{difference}",
  insufficient: "«{name}» ist eine interne Aufteilung ohne eigenes Dokument. Die Zeile bleibt ungeprüft.",
  selectedFound: "Die prüfende Person hat «{text}» nach der Auswertung markiert. Der Server hat {count} Quellen gefunden und mit dem markierten Text verglichen.",
  selectedMissing: "Die prüfende Person hat «{text}» nach der Auswertung markiert. In den Primärdokumenten wurde keine Bestätigung gefunden.",
  editedUnparsed: "In den Bericht wurde «{value}» eingetragen. Ein Zahlenvergleich mit der Quelle war nicht möglich.",
  editedMatch: "Der Quellenwert wurde in den Bericht eingetragen: {value}. Die Abweichung ist aufgehoben.",
  editedDiff: "In den Bericht wurde {value} eingetragen. Die Quelle bleibt {source}.{delta}",
  deltaShort: " Differenz {delta}.",
  fallbackMismatch: "Der Wert im Bericht ({report}) stimmt nicht mit dem Primärdokument ({source}) überein{delta}.",
  deltaComma: ", Differenz {delta}",
  fallbackMissing: "Für den Wert {value} wurde kein Beleg gefunden.",
  fallbackReview: "Die automatische Prüfung war nicht eindeutig, eine manuelle Prüfung ist nötig.",
  fallbackMatch: "Stimmt überein.",
};

const fr: Phrases = {
  orderClosed: "La quantité réceptionnée couvre la commande du contrat.",
  orderOpen: "La quantité réceptionnée est inférieure à la quantité commandée, le bon n'est donc pas encore clos.",
  blankSignature: "Le rapport indique «{report}» pour «{label}», mais la ligne de signature du document est vide. Cela ne confirme ni ne contredit l'authenticité.",
  paymentPurpose: "Le paiement n° {number} est dans le dossier, mais son objet ne mentionne pas le contrat {contract}. Le rapport seul ne permet pas de rattacher ce paiement à ce contrat.",
  completionLetter: "«{label}» est marqué comme terminé, mais aucun procès-verbal ni acte avec cet identifiant n'a été trouvé. Une lettre de disponibilité ne remplace pas le document final.",
  completionMissing: "Le dossier ne contient ni acte ni procès-verbal pour «{label}». Une facture ou une correspondance ne confirme pas à elle seule l'exécution.",
  shipmentOne: "Le dossier contient 1 livraison : {names}. Déposer deux fois le même fichier ne compte pas comme une seconde livraison.",
  shipmentMany: "Le dossier contient {count} livraisons : {names}. Déposer deux fois le même fichier ne compte pas comme une seconde livraison.",
  shipmentNone: "Aucun bon de livraison pour cette expédition n'a été trouvé dans le dossier.",
  remainder: "Le reste est la quantité du contrat moins ce qui a été réceptionné sur la période : {value}.",
  reportVsDoc: "Le rapport indique {report} ; «{document}» indique {source}.",
  valuesDisagree: "Les documents donnent des valeurs différentes pour «{label}» : {parts}. Le rapport indique {report}. Le dossier ne permet pas d'en choisir une.",
  quantityCollected: "La quantité est réunie à partir des documents d'une même opération{net} : {parts}. Total {total}.",
  netClause: ", déduction faite des retours",
  moneyDisagree: "Les documents donnent des montants différents pour «{label}» : {parts}. Le rapport indique {report}. Le dossier ne permet pas d'en choisir un.",
  moneyCollected: "Le montant est réuni à partir des lignes d'une même opération{net} : {parts}. Total {total}.",
  newerDocument: "Le document le plus récent a la priorité. Les plus anciens n'entrent pas dans le calcul : {earlier}.",
  formulaBlank: "La formule du rapport pour «{label}» n'a pas de résultat enregistré. La valeur vide n'a pas été lue comme zéro. Ouvrez le fichier dans un éditeur et enregistrez les valeurs calculées.",
  exactText: "Correspond au texte exact.",
  partialReadValue: "Aucune confirmation de «{label}» n'a été trouvée dans les documents lus. La vérification est incomplète : {detail} Le fichier non lu pouvait contenir la confirmation.",
  textSeen: "«{value}» apparaît dans {documents}.",
  damagedField: "«{document}» contient le champ «{label}», mais la valeur n'a pas été lue : le document signale une détérioration. Un plan ou un contrat ne remplace pas un fait illisible.",
  needsModel: "La formulation «{label}» n'a pas été rapprochée de façon univoque. Une clé de modèle (AI_API_KEY ou LOVABLE_API_KEY) ou une revue manuelle est nécessaire pour une comparaison de sens.",
  notFoundRole: "Les documents lus ne confirment pas «{label}» ({value}). {ask} Les documents d'autres opérations n'ont pas été utilisés.",
  askTransport: "Demandez une facture, un acte ou un justificatif de paiement pour le transport.",
  askMoney: "Demandez un acte, un bon de livraison ou une facture pour cette livraison.",
  askQuantity: "Demandez un bon de livraison ou un acte avec la quantité de cette ligne.",
  askDate: "Demandez un document portant la date de cette opération.",
  askOther: "Demandez un document primaire qui contient cette valeur.",
  itemListed: "«{value}» figure dans la liste des désignations des documents primaires. Les autres lignes de cette liste sont d'autres postes.",
  conflict: "Les documents primaires se contredisent sur «{label}» : {parts}. Le rapport indique {report}. Il reste à préciser quel document se rapporte à cette opération.",
  sourceConfirms: "Une source de la même opération confirme «{label}».",
  notFound: "Aucune confirmation de «{label}» n'a été trouvée.",
  withinTolerance: "Une source confirme «{label}» dans la tolérance indiquée.",
  mismatchDetail: "Le rapport indique {report} ; «{document}» indique {source}.{delta} Vérifiez «{label}» et demandez un document corrigé si besoin.",
  deltaReport: " Écart {delta} (rapport moins document primaire).",
  shipmentsTotal: "La ligne est la somme des livraisons : {parts}. Total {total}. Le même document n'est pas compté deux fois.{more}",
  shipmentsMore: " Vérifiez que toutes les livraisons partielles sont jointes.",
  modelLabels: "Le modèle a identifié le sens de l'intitulé {labels} ; le serveur a lu et comparé les valeurs.",
  modelUnavailable: "La requête au modèle n'a pas abouti, la limite reste en place.",
  modelOther: "Le modèle a indiqué un autre fragment dans «{document}» : «{quote}». Le statut automatique n'a pas été modifié.",
  modelNotOperation: "Le modèle a indiqué un fragment dans «{document}» : «{quote}». Ce n'est pas un document d'opération réalisée, le statut automatique n'a donc pas été clos.",
  modelCompared: "Le modèle a indiqué un fragment dans «{document}», et le serveur a comparé la valeur du rapport {report} avec la citation «{quote}».{difference}",
  deltaSource: " Écart {difference} (rapport moins source).",
  deltaSum: " Écart {difference} (rapport moins la somme des sources).",
  modelUnparsed: "Le modèle a indiqué un fragment dans «{document}», mais le serveur n'a pas pu lire la citation «{quote}» comme la même valeur que dans le rapport. Une revue manuelle est nécessaire.",
  modelMatch: "Le modèle a indiqué un fragment dans «{document}». Le serveur a vérifié que la citation figure dans ce fragment et correspond à la valeur du rapport.",
  modelSumOpen: "Le modèle a indiqué {count} sources : {listed}. Le serveur n'a pas clos la ligne sur ce montant.",
  modelSumKept: "Le modèle a indiqué {count} sources : {listed}. Le statut automatique n'a pas été modifié.",
  modelSummed: "Le modèle a indiqué {count} sources : {listed}. Le serveur les a additionnées et comparées à {report}.{difference}",
  cited: "Le serveur a comparé «{name}» avec {count} citations des documents primaires.",
  citeMissing: "Aucune citation réellement présente dans le fragment indiqué n'a été trouvée pour «{name}».",
  modelOmitted: "Le modèle n'a pas retenu «{label}». La ligne est ajoutée par les règles et reste en revue manuelle, sans statut de correspondance.",
  calculated: "Le modèle a choisi les documents du calcul. Le serveur a additionné les parties retenues : {formula} = {total}. Le rapport indique {report}.{difference}",
  insufficient: "«{name}» est une ventilation interne sans document propre. La ligne reste non vérifiée.",
  selectedFound: "Le réviseur a sélectionné «{text}» après l'analyse. Le serveur a trouvé {count} sources et les a comparées au texte sélectionné.",
  selectedMissing: "Le réviseur a sélectionné «{text}» après l'analyse. Aucune confirmation n'a été trouvée dans les documents primaires.",
  editedUnparsed: "«{value}» a été inscrit dans le rapport. La comparaison avec la source comme nombre a échoué.",
  editedMatch: "La valeur de la source a été inscrite dans le rapport : {value}. L'écart est levé.",
  editedDiff: "{value} a été inscrit dans le rapport. La source reste {source}.{delta}",
  deltaShort: " Écart {delta}.",
  fallbackMismatch: "La valeur du rapport ({report}) ne correspond pas au document primaire ({source}){delta}.",
  deltaComma: ", écart {delta}",
  fallbackMissing: "Aucun document justificatif n'a été trouvé pour {value}.",
  fallbackReview: "La vérification automatique n'a pas donné de résultat univoque, une revue manuelle est nécessaire.",
  fallbackMatch: "Correspond.",
};

const it: Phrases = {
  orderClosed: "La quantità ricevuta copre l'ordine del contratto.",
  orderOpen: "La quantità ricevuta è inferiore a quella ordinata, quindi l'ordine non è ancora chiuso.",
  blankSignature: "Nel rapporto per «{label}» è indicato «{report}», ma la riga della firma nel documento è vuota. Questo non conferma né smentisce l'autenticità.",
  paymentPurpose: "Il pagamento n. {number} è nel fascicolo, ma la causale non contiene il contratto {contract}. Il solo rapporto non permette di attribuire il pagamento a quel contratto.",
  completionLetter: "«{label}» è segnato come completato, ma non è stato trovato un verbale o un atto con questo identificativo. Una lettera di prontezza non sostituisce il documento finale.",
  completionMissing: "Nel fascicolo non c'è un atto o un verbale per «{label}». Una fattura o uno scambio di lettere da soli non confermano l'esecuzione.",
  shipmentOne: "Il fascicolo contiene 1 consegna: {names}. Caricare due volte lo stesso file non conta come un'altra consegna.",
  shipmentMany: "Il fascicolo contiene {count} consegne: {names}. Caricare due volte lo stesso file non conta come un'altra consegna.",
  shipmentNone: "Nel fascicolo non è stata trovata una bolla per questa consegna.",
  remainder: "Il residuo è la quantità del contratto meno quanto ricevuto nel periodo: {value}.",
  reportVsDoc: "Nel rapporto {report}, in «{document}» — {source}.",
  valuesDisagree: "I documenti indicano valori diversi per «{label}»: {parts}. Nel rapporto è indicato {report}. Dal fascicolo non se ne può scegliere uno.",
  quantityCollected: "La quantità è raccolta dai documenti di una stessa operazione{net}: {parts}. Totale {total}.",
  netClause: " al netto dei resi",
  moneyDisagree: "I documenti indicano importi diversi per «{label}»: {parts}. Nel rapporto è indicato {report}. Dal fascicolo non se ne può scegliere uno.",
  moneyCollected: "L'importo è raccolto dalle righe di una stessa operazione{net}: {parts}. Totale {total}.",
  newerDocument: "Il documento più recente ha la priorità. I precedenti non entrano nel calcolo: {earlier}.",
  formulaBlank: "La formula del rapporto per «{label}» non ha un risultato salvato. Il valore vuoto non è stato letto come zero. Apra il file in un editor e salvi i valori calcolati.",
  exactText: "Coincide con il testo esatto.",
  partialReadValue: "Non è stata trovata una conferma di «{label}» nei documenti letti. La verifica è incompleta: {detail} Nel file non letto poteva esserci la conferma.",
  textSeen: "«{value}» compare in {documents}.",
  damagedField: "In «{document}» c'è il campo «{label}», ma il valore non è stato letto: il documento segnala un danneggiamento. Un piano o un contratto non sostituiscono un fatto illeggibile.",
  needsModel: "La formulazione «{label}» non è stata abbinata in modo univoco. Per un confronto di significato serve una chiave del modello (AI_API_KEY o LOVABLE_API_KEY) oppure una verifica manuale.",
  notFoundRole: "Nei documenti letti non c'è conferma di «{label}» ({value}). {ask} I documenti di altre operazioni non sono stati usati.",
  askTransport: "Chieda una fattura, un atto o un documento di pagamento per il trasporto.",
  askMoney: "Chieda un atto, una bolla o una fattura per questa consegna.",
  askQuantity: "Chieda una bolla o un atto con la quantità di questa voce.",
  askDate: "Chieda un documento con la data di questa operazione.",
  askOther: "Chieda un documento primario che contenga questo valore.",
  itemListed: "«{value}» è nell'elenco delle descrizioni dei documenti primari. Le altre righe di quell'elenco sono voci diverse.",
  conflict: "I documenti primari si contraddicono su «{label}»: {parts}. Nel rapporto è indicato {report}. Va chiarito quale documento riguarda questa operazione.",
  sourceConfirms: "Una fonte della stessa operazione conferma «{label}».",
  notFound: "Non è stata trovata una conferma di «{label}».",
  withinTolerance: "Una fonte conferma «{label}» entro la tolleranza indicata.",
  mismatchDetail: "Nel rapporto {report}, in «{document}» — {source}.{delta} Verifichi «{label}» e, se serve, chieda un documento corretto.",
  deltaReport: " Differenza {delta} (rapporto meno documento primario).",
  shipmentsTotal: "La voce è la somma delle consegne: {parts}. Totale {total}. Lo stesso documento non entra due volte nella somma.{more}",
  shipmentsMore: " Verifichi se tutte le consegne parziali sono allegate.",
  modelLabels: "Il modello ha riconosciuto il significato dell'etichetta {labels}; i valori sono stati letti e confrontati dal server.",
  modelUnavailable: "La richiesta al modello non è stata eseguita, il limite resta.",
  modelOther: "Il modello ha indicato un altro frammento in «{document}»: «{quote}». Lo stato automatico non è stato modificato.",
  modelNotOperation: "Il modello ha indicato un frammento in «{document}»: «{quote}». Non è un documento di un'operazione compiuta, quindi lo stato automatico non è stato chiuso.",
  modelCompared: "Il modello ha indicato un frammento in «{document}», e il server ha confrontato il valore del rapporto {report} con la citazione «{quote}».{difference}",
  deltaSource: " Differenza {difference} (rapporto meno fonte).",
  deltaSum: " Differenza {difference} (rapporto meno la somma delle fonti).",
  modelUnparsed: "Il modello ha indicato un frammento in «{document}», ma il server non ha potuto leggere la citazione «{quote}» come lo stesso valore del rapporto. Serve una verifica manuale.",
  modelMatch: "Il modello ha indicato un frammento in «{document}». Il server ha verificato che la citazione è in quel frammento e coincide con il valore del rapporto.",
  modelSumOpen: "Il modello ha indicato {count} fonti: {listed}. Il server non ha chiuso la riga su questo importo.",
  modelSumKept: "Il modello ha indicato {count} fonti: {listed}. Lo stato automatico non è stato modificato.",
  modelSummed: "Il modello ha indicato {count} fonti: {listed}. Il server le ha sommate e confrontate con {report}.{difference}",
  cited: "Il server ha confrontato «{name}» con {count} citazioni dei documenti primari.",
  citeMissing: "Per «{name}» non è stata trovata una citazione presente nel frammento indicato.",
  modelOmitted: "Il modello non ha indicato «{label}». La riga è stata aggiunta dalle regole e lasciata alla verifica manuale, senza chiuderla come coincidenza.",
  calculated: "Il modello ha scelto quali documenti entrano nel calcolo. Il server ha sommato le parti incluse: {formula} = {total}. Nel rapporto c'è {report}.{difference}",
  insufficient: "«{name}» è una suddivisione interna senza un documento proprio. La riga resta non verificata.",
  selectedFound: "Il revisore ha selezionato «{text}» dopo l'analisi. Il server ha trovato {count} fonti e le ha confrontate con il testo selezionato.",
  selectedMissing: "Il revisore ha selezionato «{text}» dopo l'analisi. Nei documenti primari non è stata trovata una conferma.",
  editedUnparsed: "Nel rapporto è stato scritto «{value}». Non è stato possibile confrontarlo con la fonte come numero.",
  editedMatch: "Nel rapporto è stato scritto il valore della fonte: {value}. Lo scostamento è stato tolto.",
  editedDiff: "Nel rapporto è stato scritto {value}. La fonte resta {source}.{delta}",
  deltaShort: " Differenza {delta}.",
  fallbackMismatch: "Il valore nel rapporto ({report}) non coincide con il documento primario ({source}){delta}.",
  deltaComma: ", differenza {delta}",
  fallbackMissing: "Non è stato trovato un documento di supporto per il valore {value}.",
  fallbackReview: "La verifica automatica non ha dato un esito univoco, serve una verifica manuale.",
  fallbackMatch: "Coincide.",
};

const es: Phrases = {
  orderClosed: "La cantidad recibida cubre el pedido del contrato.",
  orderOpen: "La cantidad recibida es menor que la pedida, así que el pedido aún no está cerrado.",
  blankSignature: "El informe indica «{report}» para «{label}», pero la línea de firma del documento está vacía. Eso no confirma ni desmiente la autenticidad.",
  paymentPurpose: "El pago n.º {number} está en el expediente, pero su concepto no menciona el contrato {contract}. El informe por sí solo no permite asignar el pago a ese contrato.",
  completionLetter: "«{label}» está marcado como terminado, pero no se encontró un acta o protocolo con ese identificador. Una carta de disponibilidad no sustituye el documento final.",
  completionMissing: "En el expediente no hay acta ni protocolo para «{label}». Una factura o una correspondencia por sí solas no confirman la ejecución.",
  shipmentOne: "El expediente contiene 1 entrega: {names}. Cargar el mismo archivo otra vez no cuenta como otra entrega.",
  shipmentMany: "El expediente contiene {count} entregas: {names}. Cargar el mismo archivo otra vez no cuenta como otra entrega.",
  shipmentNone: "No se encontró un albarán de esta entrega en el expediente.",
  remainder: "El resto es la cantidad del contrato menos lo recibido en el periodo: {value}.",
  reportVsDoc: "En el informe, {report}; en «{document}», {source}.",
  valuesDisagree: "Los documentos dan valores distintos para «{label}»: {parts}. El informe indica {report}. El expediente no permite elegir uno.",
  quantityCollected: "La cantidad se reúne a partir de documentos de una misma operación{net}: {parts}. Total {total}.",
  netClause: ", neto de devoluciones",
  moneyDisagree: "Los documentos dan importes distintos para «{label}»: {parts}. El informe indica {report}. El expediente no permite elegir uno.",
  moneyCollected: "El importe se reúne a partir de líneas de una misma operación{net}: {parts}. Total {total}.",
  newerDocument: "El documento más reciente tiene prioridad. Los anteriores no entran en el cálculo: {earlier}.",
  formulaBlank: "La fórmula del informe para «{label}» no tiene un resultado guardado. El valor vacío no se tomó como cero. Abra el archivo en un editor y guarde los valores calculados.",
  exactText: "Coincide con el texto exacto.",
  partialReadValue: "No se encontró confirmación de «{label}» en los documentos leídos. La comprobación está incompleta: {detail} El archivo no leído podía contener la confirmación.",
  textSeen: "«{value}» aparece en {documents}.",
  damagedField: "En «{document}» está el campo «{label}», pero el valor no se leyó: el documento informa de un daño. Un plan o un contrato no sustituyen un dato ilegible.",
  needsModel: "La redacción «{label}» no se emparejó de forma unívoca. Para una comparación de significado hace falta una clave del modelo (AI_API_KEY o LOVABLE_API_KEY) o una revisión manual.",
  notFoundRole: "Los documentos leídos no confirman «{label}» ({value}). {ask} No se usaron documentos de otras operaciones.",
  askTransport: "Solicite una factura, un acta o un justificante de pago del transporte.",
  askMoney: "Solicite un acta, un albarán o una factura de esta entrega.",
  askQuantity: "Solicite un albarán o un acta con la cantidad de esta partida.",
  askDate: "Solicite un documento con la fecha de esta operación.",
  askOther: "Solicite un documento primario que contenga este valor.",
  itemListed: "«{value}» figura en la lista de denominaciones de los documentos primarios. Las demás líneas de esa lista son otras partidas.",
  conflict: "Los documentos primarios se contradicen en «{label}»: {parts}. El informe indica {report}. Hay que precisar qué documento corresponde a esta operación.",
  sourceConfirms: "Una fuente de la misma operación confirma «{label}».",
  notFound: "No se encontró confirmación de «{label}».",
  withinTolerance: "Una fuente confirma «{label}» dentro de la tolerancia indicada.",
  mismatchDetail: "El informe indica {report}; «{document}» indica {source}.{delta} Revise «{label}» y, si hace falta, pida un documento corregido.",
  deltaReport: " Diferencia {delta} (informe menos documento primario).",
  shipmentsTotal: "La partida es la suma de las entregas: {parts}. Total {total}. El mismo documento no se suma dos veces.{more}",
  shipmentsMore: " Compruebe si están adjuntas todas las entregas parciales.",
  modelLabels: "El modelo identificó el sentido del rótulo {labels}; el servidor leyó y comparó los valores.",
  modelUnavailable: "La consulta al modelo no se completó, así que la limitación se mantiene.",
  modelOther: "El modelo señaló otro fragmento en «{document}»: «{quote}». El estado automático no cambió.",
  modelNotOperation: "El modelo señaló un fragmento en «{document}»: «{quote}». No es un documento de una operación realizada, así que el estado automático no se cerró.",
  modelCompared: "El modelo señaló un fragmento en «{document}», y el servidor comparó el valor del informe {report} con la cita «{quote}».{difference}",
  deltaSource: " Diferencia {difference} (informe menos fuente).",
  deltaSum: " Diferencia {difference} (informe menos la suma de las fuentes).",
  modelUnparsed: "El modelo señaló un fragmento en «{document}», pero el servidor no pudo leer la cita «{quote}» como el mismo valor del informe. Hace falta una revisión manual.",
  modelMatch: "El modelo señaló un fragmento en «{document}». El servidor comprobó que la cita está en ese fragmento y coincide con el valor del informe.",
  modelSumOpen: "El modelo indicó {count} fuentes: {listed}. El servidor no cerró la fila con este importe.",
  modelSumKept: "El modelo indicó {count} fuentes: {listed}. El estado automático no cambió.",
  modelSummed: "El modelo indicó {count} fuentes: {listed}. El servidor las sumó y las comparó con {report}.{difference}",
  cited: "El servidor comparó «{name}» con {count} citas de los documentos primarios.",
  citeMissing: "No se encontró una cita que esté de verdad en el fragmento indicado para «{name}».",
  modelOmitted: "El modelo no incluyó «{label}». La fila se añadió desde las reglas y queda para revisión manual, sin cerrarla como coincidencia.",
  calculated: "El modelo decidió qué documentos entran en el cálculo. El servidor sumó las partes incluidas: {formula} = {total}. En el informe figura {report}.{difference}",
  insufficient: "«{name}» es un desglose interno sin un documento propio. La fila queda sin verificar.",
  selectedFound: "Quien revisa seleccionó «{text}» después del análisis. El servidor encontró {count} fuentes y las comparó con el texto seleccionado.",
  selectedMissing: "Quien revisa seleccionó «{text}» después del análisis. No se encontró confirmación en los documentos primarios.",
  editedUnparsed: "Se escribió «{value}» en el informe. No se pudo comparar con la fuente como número.",
  editedMatch: "Se escribió en el informe el valor de la fuente: {value}. La diferencia queda levantada.",
  editedDiff: "Se escribió {value} en el informe. La fuente sigue siendo {source}.{delta}",
  deltaShort: " Diferencia {delta}.",
  fallbackMismatch: "El valor del informe ({report}) no coincide con el documento primario ({source}){delta}.",
  deltaComma: ", diferencia {delta}",
  fallbackMissing: "No se encontró un documento de respaldo para el valor {value}.",
  fallbackReview: "La comprobación automática no dio un resultado unívoco; hace falta una revisión manual.",
  fallbackMatch: "Coincide.",
};

const tr: Phrases = {
  orderClosed: "Kabul edilen miktar sözleşmedeki siparişi kapatır.",
  orderOpen: "Kabul edilen miktar sipariş edilenden az olduğu için sipariş henüz kapanmamıştır.",
  blankSignature: "Raporda «{label}» için «{report}» yazıyor, ancak belgede imza satırı boş. Bu, gerçekliği ne doğrular ne de çürütür.",
  paymentPurpose: "{number} numaralı ödeme pakette var, fakat açıklaması {contract} sözleşmesini içermiyor. Yalnızca rapora bakarak ödemeyi bu sözleşmeye bağlamak mümkün değil.",
  completionLetter: "«{label}» tamamlandı olarak işaretli, ancak bu kimlikle bir tutanak veya kabul belgesi bulunamadı. Hazırlık yazısı nihai belgenin yerine geçmez.",
  completionMissing: "«{label}» için pakette kabul belgesi veya tutanak yok. Fatura ya da yazışma tek başına ifayı doğrulamaz.",
  shipmentOne: "Pakette 1 teslimat var: {names}. Aynı dosyanın yeniden yüklenmesi ikinci bir teslimat sayılmaz.",
  shipmentMany: "Pakette {count} teslimat var: {names}. Aynı dosyanın yeniden yüklenmesi ikinci bir teslimat sayılmaz.",
  shipmentNone: "Bu sevkiyat için pakette irsaliye bulunamadı.",
  remainder: "Kalan, sözleşme miktarından dönem içinde kabul edilenin çıkarılmasıdır: {value}.",
  reportVsDoc: "Raporda {report}, «{document}» belgesinde {source}.",
  valuesDisagree: "Belgeler «{label}» için farklı değerler veriyor: {parts}. Raporda {report} yazıyor. Paketten biri seçilemez.",
  quantityCollected: "Miktar aynı işlemin belgelerinden toplandı{net}: {parts}. Toplam {total}.",
  netClause: ", iadeler düşülerek",
  moneyDisagree: "Belgeler «{label}» için farklı tutarlar veriyor: {parts}. Raporda {report} yazıyor. Paketten biri seçilemez.",
  moneyCollected: "Tutar aynı işlemin satırlarından toplandı{net}: {parts}. Toplam {total}.",
  newerDocument: "Daha yeni belge önceliklidir. Daha eskiler hesaba katılmadı: {earlier}.",
  formulaBlank: "«{label}» için rapordaki formülün kayıtlı sonucu yok. Boş değer sıfır sayılmadı. Dosyayı düzenleyicide açıp hesaplanan değerleri kaydedin.",
  exactText: "Metin birebir eşleşiyor.",
  partialReadValue: "Okunan belgelerde «{label}» için doğrulama bulunamadı. Denetim eksik: {detail} Okunmayan dosyada doğrulama olabilir.",
  textSeen: "«{value}», {documents} içinde geçiyor.",
  damagedField: "«{document}» belgesinde «{label}» alanı var, ancak değer okunamadı: belge hasar bildirmiş. Plan veya sözleşme okunamayan bir olgunun yerine geçmez.",
  needsModel: "«{label}» ifadesi tek bir anlama bağlanamadı. Anlamsal karşılaştırma için bir model anahtarı (AI_API_KEY veya LOVABLE_API_KEY) ya da elle inceleme gerekir.",
  notFoundRole: "Okunan pakette «{label}» ({value}) için doğrulama yok. {ask} Başka işlemlere ait belgeler kullanılmadı.",
  askTransport: "Taşıma için fatura, kabul belgesi veya ödeme belgesi isteyin.",
  askMoney: "Bu teslimat için kabul belgesi, irsaliye veya fatura isteyin.",
  askQuantity: "Bu kalem için miktarı gösteren irsaliye veya kabul belgesi isteyin.",
  askDate: "Bu işlemin tarihini içeren bir belge isteyin.",
  askOther: "Bu değeri içeren bir birincil belge isteyin.",
  itemListed: "«{value}», birincil belgelerin ad listesinde var. Listenin diğer satırları başka kalemlerdir.",
  conflict: "Birincil belgeler «{label}» konusunda çelişiyor: {parts}. Raporda {report} yazıyor. Hangi belgenin bu işleme ait olduğu netleştirilmeli.",
  sourceConfirms: "Aynı işleme ait bir kaynak «{label}» değerini doğruluyor.",
  notFound: "«{label}» için doğrulama bulunamadı.",
  withinTolerance: "Bir kaynak, belirtilen tolerans içinde «{label}» değerini doğruluyor.",
  mismatchDetail: "Raporda {report}, «{document}» belgesinde {source}.{delta} «{label}» değerini kontrol edin ve gerekirse düzeltilmiş belge isteyin.",
  deltaReport: " Fark {delta} (rapor eksi birincil belge).",
  shipmentsTotal: "Kalem teslimatların toplamıdır: {parts}. Toplam {total}. Aynı belge toplama iki kez girmez.{more}",
  shipmentsMore: " Kısmi teslimatların hepsinin ekli olup olmadığını kontrol edin.",
  modelLabels: "Dil modeli {labels} etiketinin anlamını belirledi; değerleri sunucu okuyup karşılaştırdı.",
  modelUnavailable: "Model isteği tamamlanmadı, sınırlama duruyor.",
  modelOther: "Model «{document}» içinde başka bir parçayı gösterdi: «{quote}». Otomatik durum değiştirilmedi.",
  modelNotOperation: "Model «{document}» içinde bir parça gösterdi: «{quote}». Bu, tamamlanmış bir işlemin belgesi değil, bu yüzden otomatik durum kapatılmadı.",
  modelCompared: "Model «{document}» içinde bir parça gösterdi, sunucu rapor değeri {report} ile «{quote}» alıntısını karşılaştırdı.{difference}",
  deltaSource: " Fark {difference} (rapor eksi kaynak).",
  deltaSum: " Fark {difference} (rapor eksi kaynakların toplamı).",
  modelUnparsed: "Model «{document}» içinde bir parça gösterdi, ancak sunucu «{quote}» alıntısını rapordaki değerle aynı okuyamadı. Elle inceleme gerekir.",
  modelMatch: "Model «{document}» içinde bir parça gösterdi. Sunucu, alıntının bu parçada olduğunu ve rapor değeriyle eşleştiğini denetledi.",
  modelSumOpen: "Model {count} kaynak gösterdi: {listed}. Sunucu satırı bu tutarla kapatmadı.",
  modelSumKept: "Model {count} kaynak gösterdi: {listed}. Otomatik durum değiştirilmedi.",
  modelSummed: "Model {count} kaynak gösterdi: {listed}. Sunucu bunları toplayıp {report} ile karşılaştırdı.{difference}",
  cited: "Sunucu «{name}» değerini birincil belgelerdeki {count} alıntıyla karşılaştırdı.",
  citeMissing: "«{name}» için, belirtilen parçada gerçekten bulunan bir alıntı yok.",
  modelOmitted: "Model «{label}» göstergesini seçmedi. Satır kurallardan eklendi ve eşleşme olarak kapatılmadan elle incelemeye bırakıldı.",
  calculated: "Model hangi belgelerin hesaba gireceğine karar verdi. Sunucu dahil edilen parçaları topladı: {formula} = {total}. Raporda {report} yazıyor.{difference}",
  insufficient: "«{name}» ayrı bir belgesi olmayan iç ayrımdır. Satır denetlenmeden bırakıldı.",
  selectedFound: "İnceleyen kişi çözümlemeden sonra «{text}» metnini seçti. Sunucu {count} kaynak bulup seçilen metinle karşılaştırdı.",
  selectedMissing: "İnceleyen kişi çözümlemeden sonra «{text}» metnini seçti. Birincil belgelerde doğrulama bulunamadı.",
  editedUnparsed: "Rapora «{value}» yazıldı. Kaynakla sayı olarak karşılaştırılamadı.",
  editedMatch: "Rapora kaynak değeri yazıldı: {value}. Fark kaldırıldı.",
  editedDiff: "Rapora {value} yazıldı. Kaynak hâlâ {source}.{delta}",
  deltaShort: " Fark {delta}.",
  fallbackMismatch: "Rapordaki değer ({report}) birincil belgeyle ({source}) eşleşmiyor{delta}.",
  deltaComma: ", fark {delta}",
  fallbackMissing: "{value} değeri için destekleyici belge bulunamadı.",
  fallbackReview: "Otomatik denetim kesin bir sonuç vermedi, elle inceleme gerekir.",
  fallbackMatch: "Eşleşiyor.",
};

const pl: Phrases = {
  orderClosed: "Przyjęta ilość zamyka zamówienie z umowy.",
  orderOpen: "Przyjęta ilość jest mniejsza od zamówionej, więc zamówienie nie jest jeszcze zamknięte.",
  blankSignature: "W raporcie przy «{label}» podano «{report}», ale wiersz podpisu w dokumencie jest pusty. To ani nie potwierdza, ani nie podważa autentyczności.",
  paymentPurpose: "Płatność nr {number} jest w komplecie, ale jej tytuł nie zawiera umowy {contract}. Sam raport nie pozwala przypisać tej płatności do tej umowy.",
  completionLetter: "«{label}» jest oznaczone jako zakończone, ale nie znaleziono protokołu ani aktu z tym identyfikatorem. Pismo o gotowości nie zastępuje dokumentu końcowego.",
  completionMissing: "W komplecie nie ma aktu ani protokołu dla «{label}». Faktura lub korespondencja same nie potwierdzają wykonania.",
  shipmentOne: "W komplecie jest 1 dostawa: {names}. Ponowne wgranie tego samego pliku nie liczy się jako druga dostawa.",
  shipmentMany: "W komplecie są {count} dostawy: {names}. Ponowne wgranie tego samego pliku nie liczy się jako druga dostawa.",
  shipmentNone: "W komplecie nie znaleziono listu przewozowego tej dostawy.",
  remainder: "Pozostałość to ilość z umowy minus przyjęte w okresie: {value}.",
  reportVsDoc: "W raporcie {report}, w «{document}» — {source}.",
  valuesDisagree: "Dokumenty podają różne wartości dla «{label}»: {parts}. W raporcie jest {report}. Z kompletu nie da się wybrać jednej.",
  quantityCollected: "Ilość zebrano z dokumentów jednej operacji{net}: {parts}. Razem {total}.",
  netClause: " po odjęciu zwrotów",
  moneyDisagree: "Dokumenty podają różne kwoty dla «{label}»: {parts}. W raporcie jest {report}. Z kompletu nie da się wybrać jednej.",
  moneyCollected: "Kwotę zebrano z wierszy jednej operacji{net}: {parts}. Razem {total}.",
  newerDocument: "Nowszy dokument ma pierwszeństwo. Wcześniejsze nie weszły do obliczenia: {earlier}.",
  formulaBlank: "Formuła w raporcie dla «{label}» nie ma zapisanego wyniku. Pustej wartości nie przyjęto za zero. Otwórz plik w edytorze i zapisz obliczone wartości.",
  exactText: "Zgadza się z dokładnym tekstem.",
  partialReadValue: "W odczytanych dokumentach nie znaleziono potwierdzenia «{label}». Sprawdzenie jest niepełne: {detail} W nieodczytanym pliku mogło być potwierdzenie.",
  textSeen: "«{value}» występuje w {documents}.",
  damagedField: "W «{document}» jest pole «{label}», ale wartości nie odczytano: dokument zgłasza uszkodzenie. Plan lub umowa nie zastępują nieczytelnego faktu.",
  needsModel: "Sformułowanie «{label}» nie zostało jednoznacznie powiązane. Do porównania znaczenia potrzebny jest klucz modelu (AI_API_KEY lub LOVABLE_API_KEY) albo sprawdzenie ręczne.",
  notFoundRole: "W odczytanym komplecie nie ma potwierdzenia «{label}» ({value}). {ask} Dokumentów innych operacji nie użyto.",
  askTransport: "Poproś o fakturę, akt lub dokument płatności za transport.",
  askMoney: "Poproś o akt, dowód dostawy lub fakturę tej dostawy.",
  askQuantity: "Poproś o dowód dostawy lub akt z ilością tej pozycji.",
  askDate: "Poproś o dokument z datą tej operacji.",
  askOther: "Poproś o dokument pierwotny, w którym jest ta wartość.",
  itemListed: "«{value}» jest w wykazie nazw dokumentów pierwotnych. Pozostałe wiersze tego wykazu to inne pozycje.",
  conflict: "Dokumenty pierwotne przeczą sobie w «{label}»: {parts}. W raporcie jest {report}. Trzeba ustalić, który dokument dotyczy tej operacji.",
  sourceConfirms: "Źródło tej samej operacji potwierdza «{label}».",
  notFound: "Nie znaleziono potwierdzenia «{label}».",
  withinTolerance: "Źródło potwierdza «{label}» w podanej tolerancji.",
  mismatchDetail: "W raporcie {report}, w «{document}» — {source}.{delta} Sprawdź «{label}» i w razie potrzeby poproś o poprawiony dokument.",
  deltaReport: " Różnica {delta} (raport minus dokument pierwotny).",
  shipmentsTotal: "Pozycja składa się z dostaw: {parts}. Razem {total}. Ten sam dokument nie wchodzi do sumy drugi raz.{more}",
  shipmentsMore: " Sprawdź, czy dołączono wszystkie dostawy częściowe.",
  modelLabels: "Model językowy ustalił znaczenie podpisu {labels}; wartości odczytał i porównał serwer.",
  modelUnavailable: "Zapytanie do modelu nie zostało wykonane, ograniczenie pozostaje.",
  modelOther: "Model wskazał inny fragment w «{document}»: «{quote}». Status automatyczny nie został zmieniony.",
  modelNotOperation: "Model wskazał fragment w «{document}»: «{quote}». To nie jest dokument wykonanej operacji, więc status automatyczny nie został zamknięty.",
  modelCompared: "Model wskazał fragment w «{document}», a serwer porównał wartość z raportu {report} z cytatem «{quote}».{difference}",
  deltaSource: " Różnica {difference} (raport minus źródło).",
  deltaSum: " Różnica {difference} (raport minus suma źródeł).",
  modelUnparsed: "Model wskazał fragment w «{document}», ale serwer nie odczytał cytatu «{quote}» jako tej samej wartości co w raporcie. Potrzebne jest sprawdzenie ręczne.",
  modelMatch: "Model wskazał fragment w «{document}». Serwer sprawdził, że cytat jest w tym fragmencie i zgadza się z wartością z raportu.",
  modelSumOpen: "Model wskazał {count} źródeł: {listed}. Serwer nie zamknął wiersza tą kwotą.",
  modelSumKept: "Model wskazał {count} źródeł: {listed}. Status automatyczny nie został zmieniony.",
  modelSummed: "Model wskazał {count} źródeł: {listed}. Serwer je zsumował i porównał z {report}.{difference}",
  cited: "Serwer porównał «{name}» z {count} cytatami z dokumentów pierwotnych.",
  citeMissing: "Dla «{name}» nie znaleziono cytatu, który naprawdę jest we wskazanym fragmencie.",
  modelOmitted: "Model nie wyróżnił «{label}». Wiersz dodano z reguł i zostawiono do ręcznego sprawdzenia, bez statusu zgodności.",
  calculated: "Model wybrał dokumenty do obliczenia. Serwer zsumował włączone części: {formula} = {total}. W raporcie jest {report}.{difference}",
  insufficient: "«{name}» to wewnętrzny podział bez osobnego dokumentu. Wiersz pozostaje niesprawdzony.",
  selectedFound: "Osoba sprawdzająca zaznaczyła «{text}» po analizie. Serwer znalazł {count} źródeł i porównał je z zaznaczonym tekstem.",
  selectedMissing: "Osoba sprawdzająca zaznaczyła «{text}» po analizie. W dokumentach pierwotnych nie znaleziono potwierdzenia.",
  editedUnparsed: "Do raportu wpisano «{value}». Nie udało się porównać tego ze źródłem jako liczby.",
  editedMatch: "Do raportu wpisano wartość ze źródła: {value}. Rozbieżność została zdjęta.",
  editedDiff: "Do raportu wpisano {value}. Źródło nadal wynosi {source}.{delta}",
  deltaShort: " Różnica {delta}.",
  fallbackMismatch: "Wartość w raporcie ({report}) nie zgadza się z dokumentem pierwotnym ({source}){delta}.",
  deltaComma: ", różnica {delta}",
  fallbackMissing: "Nie znaleziono dokumentu potwierdzającego wartość {value}.",
  fallbackReview: "Automatyczne sprawdzenie nie dało jednoznacznego wyniku, potrzebna jest weryfikacja ręczna.",
  fallbackMatch: "Zgadza się.",
};

const pt: Phrases = {
  orderClosed: "A quantidade recebida cobre a encomenda do contrato.",
  orderOpen: "A quantidade recebida é menor do que a encomendada, por isso a encomenda ainda não está fechada.",
  blankSignature: "O relatório indica «{report}» para «{label}», mas a linha de assinatura do documento está em branco. Isso não confirma nem contesta a autenticidade.",
  paymentPurpose: "O pagamento n.º {number} está no conjunto, mas a sua finalidade não menciona o contrato {contract}. O relatório sozinho não permite atribuir o pagamento a esse contrato.",
  completionLetter: "«{label}» está marcado como concluído, mas não foi encontrado um auto ou protocolo com esse identificador. Uma carta de prontidão não substitui o documento final.",
  completionMissing: "O conjunto não tem auto nem protocolo para «{label}». Uma fatura ou correspondência por si só não confirma a execução.",
  shipmentOne: "O conjunto contém 1 entrega: {names}. Carregar o mesmo ficheiro outra vez não conta como outra entrega.",
  shipmentMany: "O conjunto contém {count} entregas: {names}. Carregar o mesmo ficheiro outra vez não conta como outra entrega.",
  shipmentNone: "Não foi encontrada uma guia desta entrega no conjunto.",
  remainder: "O saldo é a quantidade do contrato menos o que foi recebido no período: {value}.",
  reportVsDoc: "No relatório, {report}; em «{document}», {source}.",
  valuesDisagree: "Os documentos indicam valores diferentes para «{label}»: {parts}. O relatório indica {report}. O conjunto não permite escolher um.",
  quantityCollected: "A quantidade foi reunida a partir de documentos de uma mesma operação{net}: {parts}. Total {total}.",
  netClause: ", líquida de devoluções",
  moneyDisagree: "Os documentos indicam montantes diferentes para «{label}»: {parts}. O relatório indica {report}. O conjunto não permite escolher um.",
  moneyCollected: "O montante foi reunido a partir de linhas de uma mesma operação{net}: {parts}. Total {total}.",
  newerDocument: "O documento mais recente tem prioridade. Os anteriores não entraram no cálculo: {earlier}.",
  formulaBlank: "A fórmula do relatório para «{label}» não tem resultado guardado. O valor vazio não foi lido como zero. Abra o ficheiro num editor e guarde os valores calculados.",
  exactText: "Coincide com o texto exato.",
  partialReadValue: "Não foi encontrada confirmação de «{label}» nos documentos lidos. A verificação está incompleta: {detail} O ficheiro não lido podia conter a confirmação.",
  textSeen: "«{value}» aparece em {documents}.",
  damagedField: "Em «{document}» existe o campo «{label}», mas o valor não foi lido: o documento indica dano. Um plano ou um contrato não substituem um facto ilegível.",
  needsModel: "A formulação «{label}» não foi associada de forma unívoca. Para uma comparação de sentido é precisa uma chave do modelo (AI_API_KEY ou LOVABLE_API_KEY) ou uma revisão manual.",
  notFoundRole: "Os documentos lidos não confirmam «{label}» ({value}). {ask} Documentos de outras operações não foram usados.",
  askTransport: "Peça uma fatura, um auto ou um comprovativo de pagamento do transporte.",
  askMoney: "Peça um auto, uma guia ou uma fatura desta entrega.",
  askQuantity: "Peça uma guia ou um auto com a quantidade desta linha.",
  askDate: "Peça um documento com a data desta operação.",
  askOther: "Peça um documento primário que contenha este valor.",
  itemListed: "«{value}» está na lista de designações dos documentos primários. As outras linhas dessa lista são outras rubricas.",
  conflict: "Os documentos primários contradizem-se em «{label}»: {parts}. O relatório indica {report}. Ainda é preciso saber qual o documento desta operação.",
  sourceConfirms: "Uma fonte da mesma operação confirma «{label}».",
  notFound: "Não foi encontrada confirmação de «{label}».",
  withinTolerance: "Uma fonte confirma «{label}» dentro da tolerância indicada.",
  mismatchDetail: "O relatório indica {report}; «{document}» indica {source}.{delta} Verifique «{label}» e, se for preciso, peça um documento corrigido.",
  deltaReport: " Diferença {delta} (relatório menos documento primário).",
  shipmentsTotal: "A rubrica é a soma das entregas: {parts}. Total {total}. O mesmo documento não entra duas vezes na soma.{more}",
  shipmentsMore: " Verifique se todas as entregas parciais estão anexas.",
  modelLabels: "O modelo identificou o sentido do rótulo {labels}; o servidor leu e comparou os valores.",
  modelUnavailable: "O pedido ao modelo não foi concluído, pelo que a limitação se mantém.",
  modelOther: "O modelo indicou outro fragmento em «{document}»: «{quote}». O estado automático não foi alterado.",
  modelNotOperation: "O modelo indicou um fragmento em «{document}»: «{quote}». Não é um documento de uma operação concluída, por isso o estado automático não foi fechado.",
  modelCompared: "O modelo indicou um fragmento em «{document}», e o servidor comparou o valor do relatório {report} com a citação «{quote}».{difference}",
  deltaSource: " Diferença {difference} (relatório menos fonte).",
  deltaSum: " Diferença {difference} (relatório menos a soma das fontes).",
  modelUnparsed: "O modelo indicou um fragmento em «{document}», mas o servidor não conseguiu ler a citação «{quote}» como o mesmo valor do relatório. É necessária uma revisão manual.",
  modelMatch: "O modelo indicou um fragmento em «{document}». O servidor verificou que a citação está nesse fragmento e coincide com o valor do relatório.",
  modelSumOpen: "O modelo indicou {count} fontes: {listed}. O servidor não fechou a linha com este montante.",
  modelSumKept: "O modelo indicou {count} fontes: {listed}. O estado automático não foi alterado.",
  modelSummed: "O modelo indicou {count} fontes: {listed}. O servidor somou-as e comparou o total com {report}.{difference}",
  cited: "O servidor comparou «{name}» com {count} citações dos documentos primários.",
  citeMissing: "Não foi encontrada uma citação que esteja de facto no fragmento indicado para «{name}».",
  modelOmitted: "O modelo não indicou «{label}». A linha foi acrescentada pelas regras e ficou para revisão manual, sem ser fechada como coincidência.",
  calculated: "O modelo escolheu os documentos do cálculo. O servidor somou as partes incluídas: {formula} = {total}. No relatório está {report}.{difference}",
  insufficient: "«{name}» é uma divisão interna sem documento próprio. A linha fica por verificar.",
  selectedFound: "Quem revê selecionou «{text}» depois da análise. O servidor encontrou {count} fontes e comparou-as com o texto selecionado.",
  selectedMissing: "Quem revê selecionou «{text}» depois da análise. Não foi encontrada confirmação nos documentos primários.",
  editedUnparsed: "Foi escrito «{value}» no relatório. Não foi possível comparar com a fonte como número.",
  editedMatch: "O valor da fonte foi escrito no relatório: {value}. A diferença foi levantada.",
  editedDiff: "Foi escrito {value} no relatório. A fonte continua a ser {source}.{delta}",
  deltaShort: " Diferença {delta}.",
  fallbackMismatch: "O valor do relatório ({report}) não coincide com o documento primário ({source}){delta}.",
  deltaComma: ", diferença {delta}",
  fallbackMissing: "Não foi encontrado um documento de suporte para o valor {value}.",
  fallbackReview: "A verificação automática não deu um resultado unívoco; é necessária uma revisão manual.",
  fallbackMatch: "Coincide.",
};

const nl: Phrases = {
  orderClosed: "De ontvangen hoeveelheid dekt de bestelling uit het contract.",
  orderOpen: "De ontvangen hoeveelheid is lager dan de bestelde, dus de order is nog niet gesloten.",
  blankSignature: "Het rapport vermeldt «{report}» bij «{label}», maar de handtekeningregel in het document is leeg. Dat bevestigt de echtheid niet en weerlegt haar ook niet.",
  paymentPurpose: "Betaling nr. {number} zit in het pakket, maar de omschrijving noemt contract {contract} niet. Alleen het rapport kan deze betaling niet aan dat contract koppelen.",
  completionLetter: "«{label}» is als afgerond gemarkeerd, maar een protocol of acceptatie met deze aanduiding ontbreekt. Een gereedmelding vervangt het einddocument niet.",
  completionMissing: "Het pakket heeft geen acceptatie of protocol voor «{label}». Een factuur of briefwisseling bevestigt de uitvoering niet op zichzelf.",
  shipmentOne: "Het pakket bevat 1 levering: {names}. Hetzelfde bestand nog een keer uploaden telt niet als een tweede levering.",
  shipmentMany: "Het pakket bevat {count} leveringen: {names}. Hetzelfde bestand nog een keer uploaden telt niet als een tweede levering.",
  shipmentNone: "Een pakbon voor deze levering is niet in het pakket gevonden.",
  remainder: "Het restant is de contracthoeveelheid min wat in de periode is ontvangen: {value}.",
  reportVsDoc: "In het rapport staat {report}, in «{document}» staat {source}.",
  valuesDisagree: "Documenten noemen verschillende waarden voor «{label}»: {parts}. Het rapport vermeldt {report}. Het pakket wijst er geen aan.",
  quantityCollected: "De hoeveelheid is verzameld uit documenten van één handeling{net}: {parts}. Totaal {total}.",
  netClause: ", na aftrek van retouren",
  moneyDisagree: "Documenten noemen verschillende bedragen voor «{label}»: {parts}. Het rapport vermeldt {report}. Het pakket wijst er geen aan.",
  moneyCollected: "Het bedrag is verzameld uit regels van één handeling{net}: {parts}. Totaal {total}.",
  newerDocument: "Het nieuwere document heeft voorrang. Eerdere zijn niet meegerekend: {earlier}.",
  formulaBlank: "De formule in het rapport voor «{label}» heeft geen opgeslagen resultaat. De lege waarde is niet als nul gelezen. Open het bestand in een editor en sla de berekende waarden op.",
  exactText: "Komt overeen met de exacte tekst.",
  partialReadValue: "In de gelezen documenten is geen bevestiging van «{label}» gevonden. De controle is onvolledig: {detail} In het ongelezen bestand kan de bevestiging staan.",
  textSeen: "«{value}» komt voor in {documents}.",
  damagedField: "In «{document}» staat het veld «{label}», maar de waarde is niet gelezen: het document meldt beschadiging. Een plan of contract vervangt een onleesbaar feit niet.",
  needsModel: "De formulering «{label}» is niet eenduidig gekoppeld. Voor een inhoudelijke vergelijking is een modelsleutel (AI_API_KEY of LOVABLE_API_KEY) of een handmatige controle nodig.",
  notFoundRole: "De gelezen documenten bevestigen «{label}» ({value}) niet. {ask} Documenten over andere handelingen zijn niet gebruikt.",
  askTransport: "Vraag een factuur, een acceptatie of een betaalbewijs voor het vervoer.",
  askMoney: "Vraag een acceptatie, een pakbon of een factuur voor deze levering.",
  askQuantity: "Vraag een pakbon of een acceptatie met de hoeveelheid van deze regel.",
  askDate: "Vraag een document met de datum van deze handeling.",
  askOther: "Vraag een brondocument waarin deze waarde staat.",
  itemListed: "«{value}» staat in de lijst met omschrijvingen van de brondocumenten. De andere regels van die lijst zijn andere posten.",
  conflict: "Brondocumenten spreken elkaar tegen over «{label}»: {parts}. Het rapport vermeldt {report}. Welk document bij deze handeling hoort, moet nog worden bepaald.",
  sourceConfirms: "Een bron van dezelfde handeling bevestigt «{label}».",
  notFound: "Er is geen bevestiging van «{label}» gevonden.",
  withinTolerance: "Een bron bevestigt «{label}» binnen de opgegeven tolerantie.",
  mismatchDetail: "Het rapport vermeldt {report}; «{document}» vermeldt {source}.{delta} Controleer «{label}» en vraag zo nodig een gecorrigeerd document.",
  deltaReport: " Verschil {delta} (rapport min brondocument).",
  shipmentsTotal: "De post is de som van leveringen: {parts}. Totaal {total}. Hetzelfde document telt niet twee keer mee.{more}",
  shipmentsMore: " Controleer of alle deelleveringen zijn bijgevoegd.",
  modelLabels: "Het taalmodel heeft de betekenis van het opschrift {labels} bepaald; de server heeft de waarden gelezen en vergeleken.",
  modelUnavailable: "Het verzoek aan het model is niet uitgevoerd, de beperking blijft staan.",
  modelOther: "Het model wees een ander fragment aan in «{document}»: «{quote}». De automatische status is niet gewijzigd.",
  modelNotOperation: "Het model wees een fragment aan in «{document}»: «{quote}». Dit is geen document van een voltooide handeling, dus de automatische status is niet gesloten.",
  modelCompared: "Het model wees een fragment aan in «{document}», en de server vergeleek de rapportwaarde {report} met het citaat «{quote}».{difference}",
  deltaSource: " Verschil {difference} (rapport min bron).",
  deltaSum: " Verschil {difference} (rapport min de som van de bronnen).",
  modelUnparsed: "Het model wees een fragment aan in «{document}», maar de server kon het citaat «{quote}» niet als dezelfde waarde als in het rapport lezen. Handmatige controle is nodig.",
  modelMatch: "Het model wees een fragment aan in «{document}». De server heeft gecontroleerd dat het citaat in dat fragment staat en overeenkomt met de rapportwaarde.",
  modelSumOpen: "Het model noemde {count} bronnen: {listed}. De server heeft de regel niet op dit bedrag gesloten.",
  modelSumKept: "Het model noemde {count} bronnen: {listed}. De automatische status is niet gewijzigd.",
  modelSummed: "Het model noemde {count} bronnen: {listed}. De server heeft ze opgeteld en vergeleken met {report}.{difference}",
  cited: "De server heeft «{name}» vergeleken met {count} citaten uit de brondocumenten.",
  citeMissing: "Voor «{name}» is geen citaat gevonden dat daadwerkelijk in het genoemde fragment staat.",
  modelOmitted: "Het model heeft «{label}» niet genoemd. De rij is uit de regels toegevoegd en blijft voor handmatige controle, niet als overeenkomst.",
  calculated: "Het model koos welke documenten in de berekening horen. De server heeft de opgenomen delen opgeteld: {formula} = {total}. In het rapport staat {report}.{difference}",
  insufficient: "«{name}» is een interne uitsplitsing zonder eigen document. De rij blijft ongecontroleerd.",
  selectedFound: "De beoordelaar selecteerde «{text}» na de analyse. De server vond {count} bronnen en vergeleek die met de geselecteerde tekst.",
  selectedMissing: "De beoordelaar selecteerde «{text}» na de analyse. In de brondocumenten is geen bevestiging gevonden.",
  editedUnparsed: "«{value}» is in het rapport geschreven. Vergelijken met de bron als getal lukte niet.",
  editedMatch: "De bronwaarde is in het rapport geschreven: {value}. Het verschil is opgeheven.",
  editedDiff: "{value} is in het rapport geschreven. De bron blijft {source}.{delta}",
  deltaShort: " Verschil {delta}.",
  fallbackMismatch: "De waarde in het rapport ({report}) komt niet overeen met het brondocument ({source}){delta}.",
  deltaComma: ", verschil {delta}",
  fallbackMissing: "Er is geen ondersteunend document gevonden voor de waarde {value}.",
  fallbackReview: "De automatische controle gaf geen eenduidig resultaat; handmatige controle is nodig.",
  fallbackMatch: "Komt overeen.",
};

const zh: Phrases = {
  orderClosed: "已验收数量覆盖了合同订单。",
  orderOpen: "已验收数量少于订购数量，因此订单尚未结清。",
  blankSignature: "报表中「{label}」写的是「{report}」，但文件里的签字栏是空的。这既不能证明真实性，也不能否定真实性。",
  paymentPurpose: "第 {number} 号付款在资料包中，但其用途没有提到合同 {contract}。不能只凭报表把这笔付款归到该合同。",
  completionLetter: "「{label}」被标为已完成，但没有找到带该标识的协议或验收单。准备就绪的函件不能代替最终文件。",
  completionMissing: "资料包中没有「{label}」的验收单或协议。发票或往来函件本身不能证明已经完成。",
  shipmentOne: "资料包中有 1 笔供货：{names}。同一文件再次上传不算另一笔供货。",
  shipmentMany: "资料包中有 {count} 笔供货：{names}。同一文件再次上传不算另一笔供货。",
  shipmentNone: "资料包中没有这笔供货的送货单。",
  remainder: "余额是合同数量减去本期内已验收数量：{value}。",
  reportVsDoc: "报表为 {report}，「{document}」为 {source}。",
  valuesDisagree: "文件对「{label}」给出了不同的值：{parts}。报表写的是 {report}。资料包无法从中选定一个。",
  quantityCollected: "数量取自同一笔业务的文件{net}：{parts}。合计 {total}。",
  netClause: "（已扣除退货）",
  moneyDisagree: "文件对「{label}」给出了不同的金额：{parts}。报表写的是 {report}。资料包无法从中选定一个。",
  moneyCollected: "金额取自同一笔业务的各行{net}：{parts}。合计 {total}。",
  newerDocument: "较新的文件优先。较早的文件没有计入：{earlier}。",
  formulaBlank: "报表中「{label}」的公式没有保存计算结果。空值没有被当成零。请在编辑器中打开文件并保存计算出的值。",
  exactText: "与原文完全一致。",
  partialReadValue: "在已读取的文件中没有找到「{label}」的确认。核对不完整：{detail} 未读取的文件里可能有这份确认。",
  textSeen: "「{value}」出现在 {documents}。",
  damagedField: "「{document}」中有字段「{label}」，但没有读到数值：文件标明已损坏。计划或合同不能代替无法读取的事实。",
  needsModel: "表述「{label}」没有被唯一对应。语义比较需要模型密钥（AI_API_KEY 或 LOVABLE_API_KEY），或者人工复核。",
  notFoundRole: "已读取的资料包没有确认「{label}」（{value}）。{ask} 其他业务的文件没有被使用。",
  askTransport: "请索取运输的发票、验收单或付款凭证。",
  askMoney: "请索取这笔供货的验收单、送货单或发票。",
  askQuantity: "请索取载有该项目数量的送货单或验收单。",
  askDate: "请索取载有该业务日期的文件。",
  askOther: "请索取包含该数值的原始凭证。",
  itemListed: "「{value}」在原始凭证的名称清单中。该清单的其他行是别的项目。",
  conflict: "原始凭证在「{label}」上互相矛盾：{parts}。报表写的是 {report}。还需要确定哪一份文件属于这笔业务。",
  sourceConfirms: "同一笔业务的来源确认了「{label}」。",
  notFound: "没有找到「{label}」的确认。",
  withinTolerance: "来源在标明的容差内确认了「{label}」。",
  mismatchDetail: "报表为 {report}，「{document}」为 {source}。{delta}请核对「{label}」，必要时索取更正后的文件。",
  deltaReport: "差额 {delta}（报表减去原始凭证）。",
  shipmentsTotal: "该项目由各次供货相加：{parts}。合计 {total}。同一份文件不会重复计入。{more}",
  shipmentsMore: "请确认是否附上了所有分批供货。",
  modelLabels: "语言模型判定了标签 {labels} 的含义；数值由服务器读取并比较。",
  modelUnavailable: "模型请求没有完成，限制仍然有效。",
  modelOther: "模型指出了「{document}」中的另一处片段：「{quote}」。自动状态没有改变。",
  modelNotOperation: "模型指出了「{document}」中的片段：「{quote}」。这不是已完成业务的文件，因此自动状态没有结案。",
  modelCompared: "模型指出了「{document}」中的片段，服务器将报表值 {report} 与引文「{quote}」作了比较。{difference}",
  deltaSource: "差额 {difference}（报表减来源）。",
  deltaSum: "差额 {difference}（报表减来源合计）。",
  modelUnparsed: "模型指出了「{document}」中的片段，但服务器无法把引文「{quote}」读成与报表相同的值。需要人工复核。",
  modelMatch: "模型指出了「{document}」中的片段。服务器确认引文就在该片段中，并且与报表值一致。",
  modelSumOpen: "模型指出了 {count} 个来源：{listed}。服务器没有按这个金额结案。",
  modelSumKept: "模型指出了 {count} 个来源：{listed}。自动状态没有改变。",
  modelSummed: "模型指出了 {count} 个来源：{listed}。服务器将它们相加并与 {report} 比较。{difference}",
  cited: "服务器将「{name}」与原始凭证中的 {count} 条引文作了比较。",
  citeMissing: "没有找到确实出现在所指片段中的「{name}」引文。",
  modelOmitted: "模型没有列出「{label}」。这一行由规则补上，并留给人工复核，不会被标成一致。",
  calculated: "模型决定哪些单据计入计算。服务器把计入的部分相加：{formula} = {total}。报表中为 {report}。{difference}",
  insufficient: "「{name}」是没有单独单据的内部分项，这一行保持未核对。",
  selectedFound: "复核人在分析之后选定了「{text}」。服务器找到 {count} 个来源，并与所选文字作了比较。",
  selectedMissing: "复核人在分析之后选定了「{text}」。原始凭证中没有找到确认。",
  editedUnparsed: "报表中写入了「{value}」。无法把它当作数字与来源比较。",
  editedMatch: "已把来源的值写入报表：{value}。差异已消除。",
  editedDiff: "报表中写入了 {value}。来源仍然是 {source}。{delta}",
  deltaShort: "差额 {delta}。",
  fallbackMismatch: "报表中的值（{report}）与原始凭证（{source}）不一致{delta}。",
  deltaComma: "，差额 {delta}",
  fallbackMissing: "没有找到值 {value} 的证明文件。",
  fallbackReview: "自动核对没有得出明确结果，需要人工复核。",
  fallbackMatch: "一致。",
};

const phrases: Record<Locale, Phrases> = { ru, en, de, fr, it, es, tr, pl, pt, nl, zh };

function askText(pack: Phrases, ask: Ask): string {
  if (ask === "transport") return pack.askTransport;
  if (ask === "money") return pack.askMoney;
  if (ask === "quantity") return pack.askQuantity;
  if (ask === "date") return pack.askDate;
  return pack.askOther;
}

function render(note: CheckNote, pack: Phrases): string {
  switch (note.code) {
    case "legacy":
      return note.text;
    case "order_closed":
      return pack.orderClosed;
    case "order_open":
      return pack.orderOpen;
    case "blank_signature":
      return fill(pack.blankSignature, { label: note.label, report: note.report });
    case "payment_purpose":
      return fill(pack.paymentPurpose, { number: note.number, contract: note.contract });
    case "completion_letter":
      return fill(pack.completionLetter, { label: note.label });
    case "completion_missing":
      return fill(pack.completionMissing, { label: note.label });
    case "shipment_count":
      return note.count === 1 ? fill(pack.shipmentOne, { names: note.names }) : fill(pack.shipmentMany, { count: note.count, names: note.names });
    case "shipment_none":
      return pack.shipmentNone;
    case "remainder":
      return fill(pack.remainder, { value: note.value });
    case "report_vs_doc":
      return fill(pack.reportVsDoc, { report: note.report, document: note.document, source: note.source });
    case "values_disagree":
      return fill(pack.valuesDisagree, { label: note.label, parts: note.parts, report: note.report });
    case "quantity_collected":
      return fill(pack.quantityCollected, { net: note.net ? pack.netClause : "", parts: note.parts, total: note.total });
    case "money_disagree":
      return fill(pack.moneyDisagree, { label: note.label, parts: note.parts, report: note.report });
    case "money_collected":
      return fill(pack.moneyCollected, { net: note.net ? pack.netClause : "", parts: note.parts, total: note.total });
    case "newer_document":
      return fill(pack.newerDocument, { earlier: note.earlier });
    case "formula_blank":
      return fill(pack.formulaBlank, { label: note.label });
    case "exact_text":
      return pack.exactText;
    case "partial_read_value":
      return fill(pack.partialReadValue, { label: note.label, detail: note.detail });
    case "text_seen":
      return fill(pack.textSeen, { value: note.value, documents: note.documents });
    case "damaged_field":
      return fill(pack.damagedField, { document: note.document, label: note.label });
    case "needs_model":
      return fill(pack.needsModel, { label: note.label });
    case "not_found_role":
      return fill(pack.notFoundRole, { label: note.label, value: note.value, ask: askText(pack, note.ask) });
    case "item_listed":
      return fill(pack.itemListed, { value: note.value });
    case "conflict":
      return fill(pack.conflict, { label: note.label, parts: note.parts, report: note.report });
    case "source_confirms":
      return fill(pack.sourceConfirms, { label: note.label });
    case "not_found":
      return fill(pack.notFound, { label: note.label });
    case "within_tolerance":
      return fill(pack.withinTolerance, { label: note.label });
    case "mismatch_detail":
      return fill(pack.mismatchDetail, { report: note.report, document: note.document, source: note.source, label: note.label, delta: note.delta ? fill(pack.deltaReport, { delta: note.delta }) : "" });
    case "shipments_total":
      return fill(pack.shipmentsTotal, { parts: note.parts, total: note.total, more: note.askMore ? pack.shipmentsMore : "" });
    case "model_labels":
      return fill(pack.modelLabels, { labels: note.labels });
    case "model_unavailable":
      return pack.modelUnavailable;
    case "model_other":
      return fill(pack.modelOther, { document: note.document, quote: note.quote });
    case "model_not_operation":
      return fill(pack.modelNotOperation, { document: note.document, quote: note.quote });
    case "model_compared":
      return fill(pack.modelCompared, { document: note.document, report: note.report, quote: note.quote, difference: note.difference ? fill(pack.deltaSource, { difference: note.difference }) : "" });
    case "model_unparsed":
      return fill(pack.modelUnparsed, { document: note.document, quote: note.quote });
    case "model_match":
      return fill(pack.modelMatch, { document: note.document });
    case "model_sum_open":
      return fill(pack.modelSumOpen, { count: note.count, listed: note.listed });
    case "model_sum_kept":
      return fill(pack.modelSumKept, { count: note.count, listed: note.listed });
    case "model_summed":
      return fill(pack.modelSummed, { count: note.count, listed: note.listed, report: note.report, difference: note.difference ? fill(pack.deltaSum, { difference: note.difference }) : "" });
    case "cited":
      return fill(pack.cited, { name: note.name, count: note.count });
    case "cite_missing":
      return fill(pack.citeMissing, { name: note.name });
    case "model_omitted":
      return fill(pack.modelOmitted, { label: note.label });
    case "calculated":
      return fill(pack.calculated, { formula: note.formula, total: note.total, report: note.report, difference: note.difference ? fill(pack.deltaSum, { difference: note.difference }) : "" });
    case "insufficient":
      return fill(pack.insufficient, { name: note.name });
    case "selected_found":
      return fill(pack.selectedFound, { text: note.text, count: note.count });
    case "selected_missing":
      return fill(pack.selectedMissing, { text: note.text });
    case "edited_unparsed":
      return fill(pack.editedUnparsed, { value: note.value });
    case "edited_match":
      return fill(pack.editedMatch, { value: note.value });
    case "edited_diff":
      return fill(pack.editedDiff, { value: note.value, source: note.source, delta: note.delta ? fill(pack.deltaShort, { delta: note.delta }) : "" });
    case "fallback_mismatch":
      return fill(pack.fallbackMismatch, { report: note.report, source: note.source, delta: note.delta ? fill(pack.deltaComma, { delta: note.delta }) : "" });
    case "fallback_missing":
      return fill(pack.fallbackMissing, { value: note.value });
    case "fallback_review":
      return pack.fallbackReview;
    case "fallback_match":
      return pack.fallbackMatch;
    default: {
      const unreachable: never = note;
      return unreachable;
    }
  }
}

export function notesOf(explanation: CheckExplanation | undefined): CheckNote[] {
  if (!explanation) return [];
  if (typeof explanation === "string") return explanation.trim() ? [{ code: "legacy", text: explanation }] : [];
  return explanation;
}

export function appendNote(explanation: CheckExplanation, note: CheckNote): CheckNote[] {
  return [...notesOf(explanation), note];
}

/** Rule rows that still need a quoted fragment from the model. Legacy Russian sentences keep working. */
export function wantsModelLink(explanation: CheckExplanation): boolean {
  return notesOf(explanation).some((note) => note.code === "needs_model" || (note.code === "legacy" && note.text.includes("языковой модели")));
}

/** A later model pass already recorded that the automatic status stays. */
export function keepsAutomaticStatus(explanation: CheckExplanation): boolean {
  return notesOf(explanation).some((note) => note.code === "model_other" || note.code === "model_sum_kept" || (note.code === "legacy" && note.text.includes("Автоматический статус не изменён")));
}

export function formatExplanation(explanation: CheckExplanation | undefined, locale: Locale): string {
  return notesOf(explanation).map((note) => render(note, phrases[locale])).join(" ");
}

export function statusExplanation(check: Pick<CheckResult, "status" | "reportValue" | "sourceValue" | "discrepancy">, locale: Locale): string {
  if (check.status === "mismatch") {
    return render({ code: "fallback_mismatch", report: check.reportValue, source: check.sourceValue ?? "", ...(check.discrepancy ? { delta: check.discrepancy } : {}) }, phrases[locale]);
  }
  if (check.status === "not_found") return render({ code: "fallback_missing", value: check.reportValue }, phrases[locale]);
  if (check.status === "needs_review") return render({ code: "fallback_review" }, phrases[locale]);
  return render({ code: "fallback_match" }, phrases[locale]);
}

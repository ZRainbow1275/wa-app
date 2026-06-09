# WA message display reverse notes

## Message oneof

The decrypted native payload is the WhatsApp `Message` proto:

- `X/C30285DcY.java`: top-level message oneof.
- `conversation = 1`, `extended_text = 6`, `buttons = 42`, `buttons_response = 43`, `interactive = 45`, `interactive_response = 48`.

## Rich text surfaces

Display text should be assembled from typed message subfields instead of showing raw proto/JSON blobs:

- `X/C30277DcQ.java` (`extended_text`): `text = 1`, `matched_text = 2`, `description = 5`, `title = 6`.
- `X/C8PM.java` (`buttons_message`): `text = 1`, `content_text = 6`, `footer_text = 7`, repeated `buttons = 9`.
- `X/C8P7.java`, `X/DZS.java`, `X/DZT.java`, `X/DZR.java`: quick-reply / URL / call buttons carry `display_text = 1`; URL/call payload is field `2`.
- `X/C8PN.java` (`list_message`): `title = 1`, `description = 2`, `button_text = 3`, `footer_text = 7`.
- `X/C30206DbG.java` and `X/C30209DbJ.java` (`list_response`): reply title/description plus selected display text.
- `X/C8PZ.java` (`interactive_message`): `header = 1`, `body = 2`, `footer = 3`, `native_flow = 6`, `carousel = 7`, `bloks_widget = 8`.
- `X/C187078Oc.java`: interactive body/footer text is nested at field `1`.
- `X/C8PX.java`: interactive header title/subtitle are fields `1` and `2`.
- `X/C187308Oz.java`, `X/C187198Oo.java`: native-flow button `name = 1`, `button_params_json = 2`, message params JSON field `2`.
- `X/C8PC.java`: bloks widget `data = 2`, `fallback = 4`.
- `X/C30164Daa.java`, `X/C30146DaI.java`: interactive response body and native-flow response name/params JSON.

JSON strings in rich-message params may contain keys such as `display_text`, `url`, `title`, `body`, and `description`; wa-app normalizes these into line-based display text and lets the frontend render links.

`X/C9AP.java` confirms CTA/link button JSON also carries `merchant_url`, `consented_users_url`, `message_origin`, `webview_presentation`, `payment_link_preview`, `merchant_payment_link_preview`, and `webview_interaction`. Only human display strings and HTTP(S) URLs are projected into chat text; boolean/webview flags stay internal UI metadata and are not shown as raw JSON.

## 2026-06-09 additional message surfaces

Reverse targets from `C30285DcY.java` and child message classes:

- `DYH.java` is a real nested-message wrapper with `message = 1`; this covers view-once, ephemeral, edited, group/status/bot/question/spoiler wrapper messages. Album (`C30181Dar`) and conditional reveal (`C30182Das`) are not `DYH` wrappers; album field `1` is a caption and conditional reveal field `1` is encrypted payload.
- `C30256Dc5.java` / `C30240Dbo.java`: event messages expose title/name, description/caption, location, join/call links, and start/end timestamps.
- `C30152DaO.java`, `B0U.java`, and `C30205DbF.java`: scheduled/biz/call-log call messages expose a title or caption when present.
- `C30218DbS.java` / `C30207DbH.java`: newsletter invite messages expose newsletter name and caption.
- `DZD.java`, `DZQ.java`, `C24892Azz.java`, and `B0V.java`: comments, question responses, and status quote surfaces expose user-visible text in field `1` or `2`.
- `C30273DcM.java`, `C30183Dat.java`, `DZM.java`, `C8PQ.java`, and `C8PL.java`: sticker-pack, poll result/add-option, payment reminder, and split-payment records have displayable names/descriptions.
- `C30178Dao.java`: rich response messages hold repeated submessages and a unified response. wa-app scans nested safe string/JSON fields and still filters machine tokens.

Implementation note: wa-app now normalizes only confirmed `DYH` wrappers, preserves album captions, avoids interpreting conditional encrypted payload as a nested message, and returns semantic placeholders for known non-text message types instead of empty bodies.

## One-time historical plaintext backfill

Historical rows created before `plaintext_value` was persisted can be repaired by re-invoking `WaExtractionService.DecryptMessage` with `include_sensitive_plaintext = true` and `SESSION_COMMIT_POLICY_TRANSIENT`. This is an operational one-off: it writes normal `wa_decrypted_messages` rows through the service path and does not add migration code or retain temporary tooling.

## Read receipt and delete actions

Reverse targets:

- `SendReadReceiptJob.smali`, `ReadReceiptUtils`, `AbstractC128505kE`, `EnumC128745kd`: WA read receipts are chatd `<receipt>` nodes with `to`, first stanza `id`, `type="read"`, optional `participant`, and optional extra IDs under `<list><item id="..."/></list>`.
- `C2P0.java`, `C53042Og.java`: app-state has `markChatAsReadAction` for durable chat read sync.
- `C2P0.java`, `C53022Oe.java`, `24L.smali`, `C24S.java`: delete-for-me is an app-state/syncd local action in collection `deleteMessageForMe`.
- `C30281DcU.java`, `E5X.java`, `FIR.java`, `C31335DwJ.java`, `C31336DwK.java`: delete-for-everyone is an E2E protocol-message revoke and must use the encrypted send pipeline.

Current wa-app implementation stores the original stanza ID as `provider_message_id`, sends minimal chatd read receipts for selected inbound messages, and persists local `read_at`. Delete-for-me is implemented as a local soft delete (`DELETED_FOR_ME`) so message lists and decrypt backfills skip those rows. App-state read/delete sync and E2E revoke remain intentionally unsupported until their full send/sync pipeline is implemented.

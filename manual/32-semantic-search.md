# Search by meaning

*Who can use this: Administrators.*

Normally a search looks for the words somebody typed. **Search by meaning**
also looks for what they meant. A visitor who types "network keeps dropping"
finds your Wi-Fi troubleshooting article and your managed-switches page,
although neither contains those words. The website assistant uses it too, so it
can answer more questions from your own pages — fewer land on the *unanswered*
list (chapter 16).

Nothing is lost by switching it on: an exact title or a part number such as
`CBS350-24T` is still found first, exactly as before. If the service is slow, is
switched off or has run out of its daily allowance, search simply works on words
alone.

## What it costs

It uses the **OpenRouter key** you already saved for the other AI features
(chapter 18, "API keys"). Two kinds of request are made:

- **One small request for each new phrase a visitor searches for.** The same
  phrase again is free for 30 days. Most sites see far fewer distinct phrases
  than searches.
- **One request for every changed piece of a page**, when the page is saved and
  once a night. A site of a few hundred pages costs a few cents to read the first
  time, and little afterwards.

A **daily ceiling** keeps the first kind bounded: when the number of new phrases
for the day reaches it, search uses words alone until tomorrow. The ceiling is
2,000 a day until you change it.

## Switching it on

1. Make sure the OpenRouter key is saved on the **API keys** tab (chapter 18),
   then open **Settings → Infrastructure** and the **Search by meaning** tab.
2. Turn on the **Search by meaning** switch. Leave **Model for search by meaning** as it is
   unless your supplier tells you otherwise — `openai/text-embedding-3-small` is
   small, fast and inexpensive.
3. Set **New search phrases a day** if the default does not suit.
4. **Save settings.** Saving starts the first reading of your pages in the
   background; it takes a few minutes for a site of a few hundred pages.
5. Press **Test this model**. It sends one short sentence through the saved key
   and tells you the model answered, or tells you in OpenRouter's own words why
   it did not.

The note beside the buttons shows how many pieces of your site have been read
("1,240 of 1,240 passages indexed, 0 waiting"), how many new phrases have been
searched today, and when the last full reading finished.

If the model you chose is one OpenRouter does not offer for your key, the test
says so; choose another and save.

## Re-indexing

Pages are read again **by themselves**: when you save one, within a minute, and
once every night. Press **Re-index now** only after you have changed the model
and saved, or if something looks missing. It runs in the background, and the note
says "indexing now" until it has finished. Pressing it again while it runs does
nothing and says so.

If **Re-index now** keeps refusing and nothing seems to be running, the server's
scheduler may have stopped (**System → System status**, chapter 23); the press is
accepted again after about five minutes.

Changing the model re-reads every page, because the readings of two models cannot
be compared. Until that finishes, search uses words alone for the pages not yet
read.

## What is sent to OpenRouter

- **The text of your published pages** — titles, summaries, the written text, the
  questions and answers on them, and for a product its brand, category and
  specifications.
- **The words visitors search for.** Nothing identifies who typed them.

## What is never sent

Drafts and anything unpublished; prices and stock; customers, orders, tickets,
leads or form answers; staff details; settings; and any key or password.
A page you unpublish or delete is removed from the index at once.

Choose a paid model rather than a free one for this: free models may keep what
they are sent.

## If something looks wrong

| You see | What it means |
|---|---|
| A red box "OpenRouter refused the last request" | The key, the model or your OpenRouter balance. Read the words in the box; press **Test this model** after fixing. |
| Search by meaning does nothing, and "waiting" is large | The pages have not been read yet. Wait a few minutes, or check the scheduler. |
| A brand-new page is not found by meaning | It is found as soon as it has been read — within a minute or two of saving. Words find it at once. |
| "Today: 2,000 of 2,000 new phrases" | The daily ceiling is reached. Raise it, or wait until tomorrow. |

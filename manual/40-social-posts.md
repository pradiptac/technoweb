# LinkedIn and X posts

*Who can use this: content managers review and approve posts; administrators connect LinkedIn.*

When you publish a blog post, a case study, an event or a press release, the
site prepares a **LinkedIn post and an X post** about it. Nothing is posted
until a person has read it and pressed Approve. You find them under
**Content → Social posts**.

## What gets a draft

- A **blog post**, **case study**, **event** or **press release** (an entry of
  the Newsroom's press releases type) gets one pair of drafts, once, when it
  first goes live. Press coverage, testimonials and other kinds of content get
  none.
- A post or press release is drafted only if it went live in the last 30 days,
  so editing an old article does not produce drafts.
- Content that came in through an import is not drafted automatically.
- Want a draft for an older article, or another go at the same one? Open the
  published record and press **Draft a social post** in the header. You can do
  this as often as you like. The button is only shown for published records.

Each draft starts as the page's title and summary. A moment later the writing
assistant replaces it with a proper post, unless you have already changed the
text — your wording always wins. While it writes, the list shows "Writing…".
If AI help is switched off or its day's limit is reached, the plain text stays
and you edit it yourself.

## Reviewing and approving

1. Open **Content → Social posts**. The list shows what is waiting; use the
   filters for sent, shared by hand, failed or discarded posts.
2. Open a post. Read it, change anything you like, and watch the count under
   the box.
3. Press **Approve**, or **Discard** if it should not go out.

You do not write the link. The site adds it: on X it follows your text, and on
LinkedIn it is attached as a card showing the page.

**Length.** LinkedIn takes up to 3,000 characters. X allows 280, and the link
always counts as 23 of them, so you have **256 characters** for your own words.
The box says when a post is too long and Approve will not send it.

## What approving does

**On X**, approving opens x.com in a new tab with your text and the link already
filled in. You press Post there. Posting to X straight from the site would need
a paid X developer plan, so it is not offered; the post is recorded as "shared by
hand".

**On LinkedIn, when the page is connected**, approving posts it to the company's
LinkedIn page at once, and the post's LinkedIn address is kept with it.

**On LinkedIn, when it is not connected** (or the connection has ended, or you
press **Copy and open instead**), approving copies your text to the clipboard and
opens LinkedIn's share page for the link. Paste the text into the box and post.
If your browser refuses the clipboard, the text is shown so you can copy it
yourself. An administrator can connect LinkedIn — see below.

## "We couldn't confirm"

If LinkedIn does not answer within 15 seconds, or answers with a server error,
the site cannot tell whether the post went up, and the post is marked **Couldn't
confirm**. **Open your LinkedIn page and look.**

- If it is there, **Discard** the draft.
- If it is not, press **It isn't there, send again**, or **Copy and open** to post
  it by hand.

Sending again without looking could post it twice, so the site asks you to
check first.

A post marked **Failed** was refused by LinkedIn, and the reason is shown in
LinkedIn's words — for example, that the connection needs renewing. You can edit
the text and try again, or use **Copy and open instead**.

## Connecting LinkedIn (administrators)

LinkedIn posts to a company page through an *app* that you create on LinkedIn's
developer site and that LinkedIn must approve. Posting by hand through
**Copy and open** works while you wait.

1. Go to **developer.linkedin.com** and sign in as someone who administers the
   company's LinkedIn page. Choose **Create app**. Give it your company's name,
   attach the company page, and add a logo.
2. On the app's **Products** tab, request **Community Management API**. This is
   the product that allows posting as a company page.
3. **LinkedIn reviews the request before posting works.** You are asked what the
   app is for and how you will use it: say that your website's editors review
   and approve each post to your own company page, and that you do not collect
   other people's data. The review can take days or weeks, and it can be
   refused. Until it is approved, Connect will complete but posting will be
   refused, and approving will say so.
4. On the app's **Auth** tab, copy the **Client ID** and **Client secret**. Under
   **Authorized redirect URLs**, add your website's address followed by
   `/admin/settings/social/linkedin/callback`, for example
   `https://www.example.com/admin/settings/social/linkedin/callback`. The
   address must match exactly.
5. In the console, open **System → Social accounts**. Paste the client ID and
   secret and **save**.
6. Press **Connect LinkedIn** and sign in as the person who administers the page.
7. **Choose the page.** If you administer one page it is chosen for you. With
   several, pick one from the list. If LinkedIn will not list them, type the
   page's number — the digits in the address of its admin screen, such as
   `linkedin.com/company/12345678/admin`.

When it is done the screen shows **Connected** and "Posts go to" your page.
**Disconnect** stops posting from the site; the page you chose is remembered for
next time.

### The connection runs out

LinkedIn does not give ordinary apps a way to renew the connection by itself.
Access lasts about **sixty days**, and the screen shows the date it ends. From
seven days before, Social accounts and the review panel warn **"Reconnect
LinkedIn by <date>"**; press **Connect LinkedIn** again (you do not need to
choose the page again). If it is allowed to end, nothing breaks: approving falls
back to Copy and open until someone reconnects.

## Things to know

- Approving, discarding and asking for a draft are written to the activity log
  with who did it, and never with the post's words.
- A post you approve is sent with the text in the box when you press Approve.
- If the page was unpublished before you approved, you are told it is no longer
  published and nothing is sent.
- If a page is deleted, its unsent drafts are deleted with it; posts already
  sent or shared by hand stay in the list, marked "The page has been deleted".
- Drafts are never sent for you, and the assistant never writes the link.

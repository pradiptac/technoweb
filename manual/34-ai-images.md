# Pictures made with AI

*Who can use this: Administrators switch it on. Anyone who can use the media library makes pictures.*

**Make with AI** turns a few sentences into a picture, inside the same window you
already use to choose an image. It makes **one picture per press**, shows it to
you first, and adds nothing to your media library until you press **Use this
picture**.

## Where it is

- In any picture field - a cover, a banner, a gallery - open the picture picker and press
  **Make with AI** beside your library.
- On **Media**, the **Make with AI** button beside Upload.

If you cannot see it, pictures are switched off, there is no key, or today's
limit is used up. The tab is not drawn at all in that case.

## Switching it on

Pictures use the same switch and the same **OpenRouter key** as the AI SEO
assistant and writing help (chapters 13, 18 and 33), so there is nothing new to
connect.

1. Save the OpenRouter key on **Settings → API keys**.
2. Open **SEO → Settings** and turn on **AI SEO assistant**.
3. On the same screen set the three things for pictures:
   - **AI pictures per day** - its own ceiling, separate from writing help and
     the SEO assistant. The default is 30. **0 switches pictures off.**
   - **House picture style** - a line or two every picture follows, for example
     "Clean, bright photography in a modern Indian office or data centre." Up to
     500 characters. This is what keeps your pictures looking like one set.
   - **Picture model** - leave blank for the default, or paste another OpenRouter
     image model's id. Save, then press **Test this model** underneath: it makes
     one small picture and tells you if the model answers.
4. **Save SEO settings.**

## Making a picture

1. **Describe the picture** - what is in it, where, in what light. Ten
   characters at least, 1,000 at most. "A server rack in a bright, tidy room,
   seen from the corridor" works better than "servers".
2. Choose a **Style**: Photo, Illustration, 3D render or Flat graphic.
3. Choose a **Shape**: Wide 16:9, Landscape 4:3, Square, Portrait 3:4 or Banner
   21:9. The shape closest to the field you opened it from is already chosen.
4. Press **Make picture**. It takes up to a minute.
5. Look at it, then:
   - **Use this picture** - saves it to your media library and puts it in the
     field. You can change its **Alt text** (what a screen reader says in place of the
     picture) first; if you leave it, the first sentence of your description is used.
   - **Try again** - throws this one away and keeps your words so you can adjust
     them.
   - **Discard** - throws it away.

A picture you do not use is deleted automatically after ten minutes, and when you
close the window. Nobody else can see it.

## The three standing rules

Every picture is asked for with three rules you cannot switch off:

- **No real people.** No recognisable person or real face.
- **No other companies' logos.** No logo, trademark or brand mark.
- **No lettering.** No words, letters or numbers - a picture model cannot spell
  reliably, and a wrong word on your website is worse than none.

Do not ask for them in your description; the rules win. If you need a logo or a
photo of your own team, upload it instead.

## What is kept

A picture you keep is in the library like any other file and is checked by the
same rules (types, size). It is tagged **`ai-generated`** and its description
records the model and the words it was made from, so you can always find them
(search the library for the tag) and tell them from photographs.

If the library refuses it - it is larger than your upload limit - you are told
why and the preview stays, so you can **Discard** it and make a smaller one.

## The cost and the limit

Every picture is one request to OpenRouter, billed to your account at the model's
rate. The tab shows "**N of M** pictures used today". A picture that fails does
not count; only one that appears does. At the limit the tab goes quiet until
midnight - raise **AI pictures per day** if the default does not suit.

## What is sent to OpenRouter

Only your **description**, your **house picture style**, the style you chose and
the three rules, with your site's address and your company name so OpenRouter
can tell which site is asking. No pictures, no records, no customer information.

Choose a paid model rather than a free one: free models may keep what they are
sent.

## If something looks wrong

| You see | What it means |
|---|---|
| No **Make with AI** tab | Pictures are off, there is no key, the limit is 0, or today's limit is used up. Check **SEO → Settings** and **API keys**, then close and reopen the picker. |
| "AI help is switched off" | The **AI SEO assistant** switch is off. |
| "Today's limit of N pictures has been reached" | Wait until midnight or raise **AI pictures per day**. |
| "The image service did not answer in time" | OpenRouter or the model is busy. Try again shortly. |
| "The image service would not make that picture" | The model declined that description. Describe it differently. |
| "The image service would not accept this site's AI settings" | The key, the credit or the picture model is wrong. Ask an administrator to check the OpenRouter key and press **Test this model** on **SEO → Settings**. |
| "That preview has expired. Make the picture again." | More than ten minutes passed. Make it again. |

## Limits of this release

- One picture at a time; no editing of an existing picture and no starting from a
  photo of your own.
- Several people making pictures at once can take the day slightly past the
  limit.

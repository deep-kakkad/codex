# Creative upload (planned, not built)

Let a team upload the real creative for a version (an image ad, a banner, a social
post) and have the buyers judge it, instead of typing the copy in by hand.

## Why it has to go through a description

The buyer model, TypeSafe's Jev, takes text only. Its docs say it accepts "text
only… no image, audio, or video input" and that images must be turned into text
or structured fields before they are sent (https://docs.typesafe.ai/models). So the
buyers never see pixels. They judge a description of the creative.

## The flow

1. The user uploads a creative for a version (JPG, PNG or WebP; resized in the
   browser before upload).
2. An OpenAI vision model (the same account that runs Ask and research) writes a
   detailed description of the creative: every word on it, exactly as written, and
   what the image shows.
3. That description goes to Jev as part of the ad, and the round runs as it does
   today.
4. The description is stored against the creative. Unless the user changes the
   creative, later rounds reuse the same description, so the same creative is
   always judged on the same words and results stay comparable round to round.

## Credits

- A round that uses an uploaded creative costs **10 credits**.
- If the user changes the creative for the next round, that round costs
  **10 credits** again.
- A round that reuses an unchanged creative doesn't generate a new description.
- If the description or the round fails, the credits go back, the same as Ask and
  research today.

Open question: when several versions in one round have creatives and more than one
changes, is it 10 credits for the round, or 10 per changed creative?

## Rules to keep it fair and honest

- **Same kind for every version.** In a round, every version has a creative or
  none does, the same rule as the optional fields. Otherwise a version could win
  by having more for the buyers to go on.
- **Plain facts, fixed shape.** The description follows one fixed set of facts for
  every image: the text on it, who and what is shown, the setting, whether the
  product is visible, how much of the image is text, the main colours, the layout.
  No quality words ("stunning", "vibrant"), because the wording would move the
  result instead of the image.
- **Say what it can't judge.** The page says plainly that buyers read a
  description, so they can't tell which of two near-identical images looks better,
  whether text is legible at thumbnail size, or how colours feel.
- **Check stability before launch.** Describe the same creative several times and
  run the same round three times; measure how much share moves, the same way the
  order effect and re-run noise were measured, and publish the number.

## Also needed

- Storage for the images (Netlify Blobs), private to the account.
- Shared links include the image only if the user opts in.
- A way to delete an uploaded creative.
- The page says the image is sent to a model to be read.
- The format mocks (social post, landing page, email) show the real image.
- Video is out of scope for the first version.

// Putting text into LinkedIn's boxes in a way its page code notices, so Send becomes clickable.
(() => {
  // Compare tag names rather than instanceof: boxes can live in another frame's realm
  const isPlainField = (box) => box.tagName === 'TEXTAREA' || box.tagName === 'INPUT';

  function currentText(box) {
    return (isPlainField(box) ? box.value : box.textContent).trim();
  }

  function fillPlainField(box, text) {
    // Set the value through the native setter so LinkedIn's framework sees the change
    const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    box.focus();
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    box.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Hands text to a rich editor as a paste. Plain text alone isn't enough: ProseMirror (LinkedIn's
  // newer editor) turns each run of line breaks into one paragraph break, dropping blank lines, so
  // the paste also carries HTML with one paragraph per line, empty ones included
  function pasteText(box, text) {
    const escape = (line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    clipboardData.setData('text/html', text.split(/\r\n?|\n/).map((line) => `<p>${escape(line)}</p>`).join(''));
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }

  function fillRichEditor(box, text) {
    // TipTap/ProseMirror: setting its text directly would not update LinkedIn's state,
    // so hand it the text as a paste
    box.focus();
    pasteText(box, text);

    if (!currentText(box)) {
      CN.log('Paste was ignored, typing the text instead');
      box.ownerDocument.execCommand('insertText', false, text);
    }
  }

  function fillBox(box, text) {
    if (isPlainField(box)) fillPlainField(box, text);
    else fillRichEditor(box, text);
  }

  // Inserts at the cursor, keeping whatever is already in the box (never replaces it)
  function insertText(box, text) {
    if (isPlainField(box)) {
      box.focus();
      // Collapse any selection to its end so selected text isn't replaced
      const at = box.selectionEnd ?? box.value.length;
      box.setRangeText(text, at, at, 'end');
      box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return;
    }
    // Rich editors insert a paste at the cursor; the panel keeps focus in the editor,
    // so the cursor is where the person left it
    box.focus();
    const before = box.textContent;
    pasteText(box, text);
    if (box.textContent === before) box.ownerDocument.execCommand('insertText', false, text);
  }

  Object.assign(CN, { currentText, fillBox, insertText });
})();

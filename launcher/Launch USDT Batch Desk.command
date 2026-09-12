#!/bin/zsh
# Launch relative to this file so the whole folder can be moved anywhere.
cd -- "${0:A:h}" || exit 1
for batch_python in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [[ -x "$batch_python" ]]; then
    exec "$batch_python" "$PWD/serve.py"
  fi
done
print 'Python 3 is required to run the local launcher.'
read '?Press Enter to close.'

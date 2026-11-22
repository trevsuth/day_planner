from base64 import b64decode
from binascii import Error

from app_graph.database import InvalidAttachment, save_workspace
from app_graph.models import MAX_ATTACHMENT_BYTES, WorkspaceUpdate


def update_workspace(update: WorkspaceUpdate) -> int:
    sizes = {}
    for node in update.document.nodes:
        for attachment in node.attachments:
            key = attachment.storageKey
            if key is None:
                continue
            if sizes.setdefault(key, attachment.sizeBytes) != attachment.sizeBytes:
                raise InvalidAttachment("An attachment key has conflicting file sizes.")

    files = {}
    for key, encoded in update.files.items():
        if key not in sizes:
            raise InvalidAttachment("An uploaded attachment must belong to the graph.")
        try:
            data = b64decode(encoded, validate=True)
        except (ValueError, Error) as error:
            raise InvalidAttachment("An attachment has invalid file data.") from error
        if len(data) > MAX_ATTACHMENT_BYTES or len(data) != sizes[key]:
            raise InvalidAttachment(
                "Attachments must match their declared size and be at most 10 MiB."
            )
        files[key] = data

    return save_workspace(update, files, sizes)

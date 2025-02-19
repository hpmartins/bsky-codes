import logging
import sys


class Logger:
    def __init__(self, name: str, level: int = logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)

        # Create handlers if they don't exist
        if not self.logger.hasHandlers():
            out_stream_handler = logging.StreamHandler(sys.stdout)
            out_stream_handler.setLevel(logging.DEBUG)
            out_stream_handler.addFilter(lambda record: record.levelno <= logging.INFO)
            err_stream_handler = logging.StreamHandler(sys.stderr)
            err_stream_handler.setLevel(logging.WARNING)

            # Add handlers to the logger
            self.logger.addHandler(out_stream_handler)
            self.logger.addHandler(err_stream_handler)

    def debug(self, msg, *args, **kwargs):
        self.logger.debug(msg, *args, **kwargs)

    def info(self, msg, *args, **kwargs):
        self.logger.info(msg, *args, **kwargs)

    def warning(self, msg, *args, **kwargs):
        self.logger.warning(msg, *args, **kwargs)

    def error(self, msg, *args, **kwargs):
        self.logger.error(msg, *args, **kwargs)

    def critical(self, msg, *args, **kwargs):
        self.logger.critical(msg, *args, **kwargs)


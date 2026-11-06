"""작업 3의 공통 오류 형식. 원래 값·임의 키를 오류에 복사하지 않는다."""

import json


class PlanningValidationError(ValueError):
    def __init__(self, code, path, message):
        self.errors = [{"code": code, "path": path, "message": message}]
        super().__init__(json.dumps({"errors": self.errors}, ensure_ascii=False))

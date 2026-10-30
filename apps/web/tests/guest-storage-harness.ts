import { fingerprintGuestSnapshot } from "@reactive-resume/resume/guest-draft";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import * as snapshot from "../src/features/resume/guest/snapshot";
import * as storage from "../src/features/resume/guest/storage";

Object.assign(window, { guestTest: { ...storage, ...snapshot, defaultResumeData, fingerprintGuestSnapshot } });

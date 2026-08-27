import type { JsonObject, Message } from "@bufbuild/protobuf";
import type {
  GenEnum,
  GenFile,
  GenMessage,
} from "@bufbuild/protobuf/codegenv2";
import { enumDesc, fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import type {
  Any,
  Duration,
  FieldMask,
  ListValue,
  Timestamp,
  Value,
} from "@bufbuild/protobuf/wkt";
import {
  file_google_protobuf_any,
  file_google_protobuf_duration,
  file_google_protobuf_field_mask,
  file_google_protobuf_struct,
  file_google_protobuf_timestamp,
  file_google_protobuf_wrappers,
} from "@bufbuild/protobuf/wkt";
import { file_buf_validate_validate } from "../../buf/validate/validate_pb.js";
import { file_protoform_v1_auto_form_ui } from "./auto_form_ui_pb.js";

/**
 * Describes the file protoform/v1/auto_form_example.proto.
 */
export const file_protoform_v1_auto_form_example: GenFile =
  /*@__PURE__*/
  fileDesc(
    "CiRwcm90b2Zvcm0vdjEvYXV0b19mb3JtX2V4YW1wbGUucHJvdG8SDHByb3RvZm9ybS52MSKsFwoPQXV0b0Zvcm1FeGFtcGxlEiwKCHVzZXJuYW1lGAEgASgJQhq6SBfIAQFyEhADGCAyDF5bYS16MC05X10rJBJNCg1wcmltYXJ5X2VtYWlsGAIgASgJQja6SAfIAQFyAmAByvMYKAgEEhB0ZWFtQGV4YW1wbGUuY29tGhJhbGVydHNAZXhhbXBsZS5jb20SWwoMaG9tZXBhZ2VfdXJsGAMgASgJQkW6SAVyA4gBAcrzGDkIBRIYaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzGhtodHRwczovL2V4YW1wbGUuY29tL3Byb2R1Y3QSHQoLcmVzb3VyY2VfaWQYBCABKAlCCLpIBXIDsAEBEmwKA2JpbxgFIAEoCUJfukgFcgMYmALK8xhTCAISJFNoYXJlIGEgc2hvcnQgc3VtbWFyeSBmb3IgcmV2aWV3ZXJzLhopUGxhdGZvcm0gYWRtaW4gZm9yIHRoZSB0aGUgY29udHJvbCBwbGFuZS4SSwoKaXNfZW5hYmxlZBgGIAEoCEI3yvMYMwgIIi9Ub2dnbGUgdGhlIHJlcXVlc3Qgb24gb3Igb2ZmIGJlZm9yZSBpdCBpcyBzZW50LhIWCgNhZ2UYByABKAVCCbpIBhoEGHgoDRIeCgtsb2dpbl9jb3VudBgIIAEoDUIJukgGKgQYoI0GEiUKEHJlcHV0YXRpb25fZGVsdGEYCSABKBFCC7pICDoGGNAPKM8PEiAKD2VtcGxveWVlX251bWJlchgKIAEoA0IHukgEIgIgABIlChNzdG9yYWdlX3F1b3RhX2J5dGVzGAsgASgEQgi6SAUyAyiACBImCg1wcm9maWxlX3Njb3JlGAwgASgCQg+6SAwKCh0AAMhCLQAAAAASQgoPYWNjb3VudF9iYWxhbmNlGA0gASgBQim6SBQSEhkAAAAAgIQuQSkAAAAAAAAAAMrzGA4IBhoKJDEyLDUwMC4wMBIeCgxhdmF0YXJfYnl0ZXMYDiABKAxCCLpIBXoDGIAEEnUKC2FjY2Vzc190aWVyGA8gASgOMhgucHJvdG9mb3JtLnYxLkFjY2Vzc1RpZXJCRrpIBYIBAhAByvMYOggKIjZDaG9vc2UgdGhlIGFjY2VzcyB0aWVyIHRoYXQgYmVzdCBtYXRjaGVzIHRoaXMgcmVxdWVzdC4SNwoQc2hpcHBpbmdfYWRkcmVzcxgQIAEoCzIVLnByb3RvZm9ybS52MS5BZGRyZXNzQga6SAPIAQESXQoPYmlsbGluZ19hZGRyZXNzGBEgASgLMhUucHJvdG9mb3JtLnYxLkFkZHJlc3NCLcrzGCkqJwoPYmlsbGluZy52aXNpYmxlEhRmb3JtLmFjY2Vzc1RpZXIgPT0gMxJNCghuaWNrbmFtZRgSIAEoCUI2ukgGcgQQAhgoyvMYKSonChBuaWNrbmFtZS52aXNpYmxlEhNmb3JtLnVzZXJuYW1lICE9ICcnSAGIAQESOgoLbWlkZGxlX25hbWUYEyABKAsyHC5nb29nbGUucHJvdG9idWYuU3RyaW5nVmFsdWVCB7pIBHICGCgSZAoMYm9udXNfcG9pbnRzGBQgASgLMhsuZ29vZ2xlLnByb3RvYnVmLkludDMyVmFsdWVCMbpIBxoFGJBOKADK8xgjMiEKDmJvbnVzLmRpc2FibGVkEg8hZm9ybS5pc0VuYWJsZWQSgwEKC2JldGFfdGVzdGVyGBUgASgLMhouZ29vZ2xlLnByb3RvYnVmLkJvb2xWYWx1ZUJSyvMYTggJIkpVc2UgYSBjb21wYWN0IHRvZ2dsZSB3aGVuIHRoaXMgb3B0aW9uYWwgc2V0dGluZyBjYW4gYmUgc3dpdGNoZWQgb24gb3Igb2ZmLhIwCgR0YWdzGBYgAygJQiK6SB+SARwIARAFGAEiFHISEAIYGDIMXlthLXowLTktXSskEjsKEnByZXZpb3VzX2FkZHJlc3NlcxgXIAMoCzIVLnByb3RvZm9ybS52MS5BZGRyZXNzQgi6SAWSAQIQAxIpCg1sdWNreV9udW1iZXJzGBggAygFQhK6SA+SAQwQBBgBIgYaBBhjKAESegoGbGFiZWxzGBkgAygLMikucHJvdG9mb3JtLnYxLkF1dG9Gb3JtRXhhbXBsZS5MYWJlbHNFbnRyeUI/ukgnmgEkCAEQBCIWchQQAhgYMg5eW2EtejAtOV8uLV0rJCoGcgQQARhAyvMYEQgOGg10ZWFtPWZyb250ZW5kEm4KEG9mZmljZV9sb2NhdGlvbnMYGiADKAsyMi5wcm90b2Zvcm0udjEuQXV0b0Zvcm1FeGFtcGxlLk9mZmljZUxvY2F0aW9uc0VudHJ5QiC6SB2aARoQAyIWchQQAhgYMg5eW2EtejAtOV8uLV0rJBIiCg9wcmVmZXJyZWRfZW1haWwYGyABKAlCB7pIBHICYAFIABIzCg9wcmVmZXJyZWRfcGhvbmUYHCABKAlCGLpIFXITMhFeXCtbMS05XVxkezEsMTR9JEgAEhgKDmRvX25vdF9jb250YWN0GB0gASgISAASPAoKY3JlYXRlZF9hdBgeIAEoCzIaLmdvb2dsZS5wcm90b2J1Zi5UaW1lc3RhbXBCDLpIA8gBAcrzGAIIERI/CgpleHBpcmVzX2F0GB8gASgLMhouZ29vZ2xlLnByb3RvYnVmLlRpbWVzdGFtcEIPukgMsgEJSgUIgOeED0ABEkYKEXJlbWluZGVyX2ludGVydmFsGCAgASgLMhkuZ29vZ2xlLnByb3RvYnVmLkR1cmF0aW9uQhC6SA2qAQoiBAiA9SQyAgg8EnIKDndyaXRhYmxlX3BhdGhzGCEgASgLMhouZ29vZ2xlLnByb3RvYnVmLkZpZWxkTWFza0I+ukg74gE4Egdwcm9maWxlEgtwcm9maWxlLmJpbxILcHJlZmVyZW5jZXMSE25vdGlmaWNhdGlvbnMuZW1haWwSLAoLcHJlZmVyZW5jZXMYIiABKAsyFy5nb29nbGUucHJvdG9idWYuU3RydWN0Ei4KDmZlYXR1cmVkX3ZhbHVlGCMgASgLMhYuZ29vZ2xlLnByb3RvYnVmLlZhbHVlEjQKEGRhc2hib2FyZF9ibG9ja3MYJCABKAsyGi5nb29nbGUucHJvdG9idWYuTGlzdFZhbHVlEmIKEGV4dGVybmFsX3BheWxvYWQYJSABKAsyFC5nb29nbGUucHJvdG9idWYuQW55QjK6SC+iASwSKnR5cGUuZ29vZ2xlYXBpcy5jb20vZ29vZ2xlLnByb3RvYnVmLlN0cnVjdBIkChFtaW5pbXVtX3RocmVzaG9sZBgmIAEoBUIJukgGGgQYZCgAEiQKEW1heGltdW1fdGhyZXNob2xkGCcgASgFQgm6SAYaBBhkKAASLwoIc2V0dGluZ3MYKCABKAsyHS5wcm90b2Zvcm0udjEuUHJvZmlsZVNldHRpbmdzGi0KC0xhYmVsc0VudHJ5EgsKA2tleRgBIAEoCRINCgV2YWx1ZRgCIAEoCToCOAEaTQoUT2ZmaWNlTG9jYXRpb25zRW50cnkSCwoDa2V5GAEgASgJEiQKBXZhbHVlGAIgASgLMhUucHJvdG9mb3JtLnYxLkFkZHJlc3M6AjgBOo4BukiKARqHAQoPdGhyZXNob2xkLnJhbmdlEkJNaW5pbXVtIHRocmVzaG9sZCBtdXN0IGJlIGxlc3MgdGhhbiBvciBlcXVhbCB0byBtYXhpbXVtIHRocmVzaG9sZC4aMHRoaXMubWluaW11bV90aHJlc2hvbGQgPD0gdGhpcy5tYXhpbXVtX3RocmVzaG9sZEJmChFwcmVmZXJyZWRfY29udGFjdBJRukgCCAHS8xhICjNQaWNrIGV4YWN0bHkgb25lIHJvdXRlIGZvciBmb2xsb3ctdXAgY29tbXVuaWNhdGlvbi4qEVByZWZlcnJlZCBjb250YWN0QgsKCV9uaWNrbmFtZSLyDAoZQXV0b0Zvcm1VaU1ldGFkYXRhRXhhbXBsZRKOAQoMY2x1c3Rlcl9uYW1lGAEgASgJQni6SAnIAQFyBBADGD/K8xhoEhZzY2FybGV0LWZvcmVzdC1kb2xwaGluIkZVc2UgdGhlIG5hbWUgb3BlcmF0b3JzIHdpbGwgcmVjb2duaXplIGluIGRlcGxveW1lbnQgYW5kIHN1cHBvcnQgdG9vbHMuOgZiYXNpY3MSgQEKCHByb3ZpZGVyGAIgASgOMhwucHJvdG9mb3JtLnYxLlVpRGVtb1Byb3ZpZGVyQlG6SAWCAQIQAcrzGEUICiJBUmFkaW8gYnV0dG9ucyBtYWtlIHNtYWxsIGVudW1zIGVhc2llciB0byBzY2FuIGluIGdlbmVyYXRlZCBmb3Jtcy4SiwEKBnJlZ2lvbhgDIAEoCUJ7ukgJyAEBcgQQAxggyvMYaxIJdXMtZWFzdC0yIjdUaGlzIGZpZWxkIHN0YXlzIGRpc2FibGVkIHVudGlsIGEgcHJvdmlkZXIgaXMgc2VsZWN0ZWQuMiUKD3JlZ2lvbi5kaXNhYmxlZBISZm9ybS5wcm92aWRlciA9PSAwEnIKE2VuYWJsZV9zdXBwb3J0X21vZGUYBCABKAhCVcrzGFEICSJNVHVybiB0aGlzIG9uIHRvIHJldmVhbCB0aGVzdXBwb3J0IGNvbnRyb2xzIHRoYXQgYXJlIGRyaXZlbiBieSBmaWVsZCBVSSBydWxlcy4SmgEKDHN1cHBvcnRfdGllchgFIAEoDjIfLnByb3RvZm9ybS52MS5VaURlbW9TdXBwb3J0VGllckJjyvMYXwgKIltTZWxlY3RpbmcgYSBzdXBwb3J0IHRpZXIgZW5hYmxlcyB0aGUgdGltZXN0YW1wIGZpZWxkIGFuZCByZXZlYWxzIHRoZSBzdXBwb3J0IGNvbnRhY3Qgb25lb2YuEqQBChJtYWludGVuYW5jZV93aW5kb3cYBiABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wQmzK8xhoCBEiNVRoaXMgc3RheXMgZGlzYWJsZWQgdW50aWwgYSBzdXBwb3J0IHRpZXIgaXMgc2VsZWN0ZWQuMi0KFG1haW50ZW5hbmNlLmRpc2FibGVkEhVmb3JtLnN1cHBvcnRUaWVyID09IDAS0AEKEWVzY2FsYXRpb25fcmVhc29uGAcgASgJQrQBukgFcgMYmALK8xinAQgCEjFFeHBsYWluIHdoeSB0aGlzIHJvbGxvdXQgbmVlZHMgcGxhdGludW0gY292ZXJhZ2UuIkFUaGlzIGZpZWxkIGlzIGhpZGRlbiB1bmxlc3MgdGhlIGhpZ2hlc3Qgc3VwcG9ydCB0aWVyIGlzIHNlbGVjdGVkLiorChJlc2NhbGF0aW9uLnZpc2libGUSFWZvcm0uc3VwcG9ydFRpZXIgPT0gM0gBEiAKDXN1cHBvcnRfZW1haWwYCCABKAlCB7pIBHICYAFIABI0Cg1zbGFja19jaGFubmVsGAkgASgJQhu6SBhyFjIUXiM/W2EtejAtOV8tXXszLDgwfSRIABIWCgxub19mb2xsb3dfdXAYCiABKAhIABItCglhcGlfdG9rZW4YDSABKAlCGrpIBXIDGIACyvMYDggDEgpycF90b2tfLi4uEocBCg9hcHByb3ZhbF90aWNrZXQYCyABKAlCbrpICcgBAXIEEAMYKMrzGF4SB09QUy0xNDIiU0ZpbmFsIGZpZWxkcyBjYW4gc3RheSBzaW1wbGUgd2hpbGUgb3RoZXIgZmllbGRzIHVzZSBDRUwgZm9yIHByb2dyZXNzaXZlIGRpc2Nsb3N1cmUuEh4KDmVuYWJsZV9kcnlfcnVuGAwgASgIQgbK8xgCCAlC3QEKD3N1cHBvcnRfY29udGFjdBLJAdLzGMQBClxUaGlzIG9uZW9mIGlzIGFsc28gZHJpdmVuIGJ5IFVJIG1ldGFkYXRhLCBzbyBpdCBvbmx5IGFwcGVhcnMgYWZ0ZXIgYSBzdXBwb3J0IHRpZXIgaXMgY2hvc2VuLhJKChdzdXBwb3J0LmNvbnRhY3QudmlzaWJsZRIvZm9ybS5lbmFibGVTdXBwb3J0TW9kZSAmJiBmb3JtLnN1cHBvcnRUaWVyICE9IDAiB3N1cHBvcnQqD1N1cHBvcnQgY29udGFjdCKNAgoHQWRkcmVzcxIcCghsaW5lX29uZRgBIAEoCUIKukgHyAEBcgIQAxIYCgRjaXR5GAIgASgJQgq6SAfIAQFyAhACEhYKBXN0YXRlGAMgASgJQge6SARyAhACEi4KC3Bvc3RhbF9jb2RlGAQgASgJQhm6SBZyFDISXltBLVowLTkgLV17MywxMn0kEjQKB2NvdW50cnkYBSABKA4yGS5wcm90b2Zvcm0udjEuQ291bnRyeUNvZGVCCLpIBYIBAhABEigKCGxvY2F0aW9uGAYgASgLMhYucHJvdG9mb3JtLnYxLkdlb1BvaW50EhUKCGxpbmVfdHdvGAcgASgJSACIAQFCCwoJX2xpbmVfdHdvImEKCEdlb1BvaW50EikKCGxhdGl0dWRlGAEgASgBQhe6SBQSEhkAAAAAAIBWQCkAAAAAAIBWwBIqCglsb25naXR1ZGUYAiABKAFCF7pIFBISGQAAAAAAgGZAKQAAAAAAgGbAIsMFCg9Qcm9maWxlU2V0dGluZ3MSIwoTZW5hYmxlX3N1cHBvcnRfbW9kZRgBIAEoCEIGyvMYAggIEoYBChBlc2NhbGF0aW9uX2xldmVsGAIgASgOMh0ucHJvdG9mb3JtLnYxLkVzY2FsYXRpb25MZXZlbEJNukgFggECEAHK8xhBMj8KG3N1cHBvcnQuZXNjYWxhdGlvbi5kaXNhYmxlZBIgIWZvcm0uc2V0dGluZ3MuZW5hYmxlU3VwcG9ydE1vZGUSaQoVbm90aWZpY2F0aW9uX2NoYW5uZWxzGAMgAygOMiEucHJvdG9mb3JtLnYxLk5vdGlmaWNhdGlvbkNoYW5uZWxCJ7pIEJIBDQgBEAQYASIFggECEAHK8xgQCA0aDEVNQUlMLCBTTEFDSxKmAQoPbmVzdGVkX3NldHRpbmdzGAQgAygLMjEucHJvdG9mb3JtLnYxLlByb2ZpbGVTZXR0aW5ncy5OZXN0ZWRTZXR0aW5nc0VudHJ5Qlq6SA2aAQoQAyIGcgQQAhgeyvMYRiJES2VlcCBzdXBwb3J0IHNldHRpbmdzIGdyb3VwZWQgYnkga2V5IHNvIHJlbGF0ZWQgcnVsZXMgc3RheSB0b2dldGhlci4aUgoTTmVzdGVkU2V0dGluZ3NFbnRyeRILCgNrZXkYASABKAkSKgoFdmFsdWUYAiABKAsyGy5wcm90b2Zvcm0udjEuTmVzdGVkU2V0dGluZzoCOAE6mQG6SJUBGpIBChtzdXBwb3J0LnJlcXVpcmVzLmVzY2FsYXRpb24SOkVzY2FsYXRpb24gbGV2ZWwgbXVzdCBiZSBzZXQgd2hlbiBzdXBwb3J0IG1vZGUgaXMgZW5hYmxlZC4aNyF0aGlzLmVuYWJsZV9zdXBwb3J0X21vZGUgfHwgdGhpcy5lc2NhbGF0aW9uX2xldmVsICE9IDAiWgoNTmVzdGVkU2V0dGluZxIWCgVsYWJlbBgBIAEoCUIHukgEcgIQAhIxCg1zY2hlZHVsZWRfZm9yGAIgASgLMhouZ29vZ2xlLnByb3RvYnVmLlRpbWVzdGFtcCpwCgpBY2Nlc3NUaWVyEhsKF0FDQ0VTU19USUVSX1VOU1BFQ0lGSUVEEAASFgoSQUNDRVNTX1RJRVJfVklFV0VSEAESFgoSQUNDRVNTX1RJRVJfRURJVE9SEAISFQoRQUNDRVNTX1RJRVJfQURNSU4QAyqCAQoOVWlEZW1vUHJvdmlkZXISIAocVUlfREVNT19QUk9WSURFUl9VTlNQRUNJRklFRBAAEhgKFFVJX0RFTU9fUFJPVklERVJfQVdTEAESGAoUVUlfREVNT19QUk9WSURFUl9HQ1AQAhIaChZVSV9ERU1PX1BST1ZJREVSX0FaVVJFEAMqogEKEVVpRGVtb1N1cHBvcnRUaWVyEiQKIFVJX0RFTU9fU1VQUE9SVF9USUVSX1VOU1BFQ0lGSUVEEAASIQodVUlfREVNT19TVVBQT1JUX1RJRVJfU1RBTkRBUkQQARIhCh1VSV9ERU1PX1NVUFBPUlRfVElFUl9QUklPUklUWRACEiEKHVVJX0RFTU9fU1VQUE9SVF9USUVSX1BMQVRJTlVNEAMqfwoLQ291bnRyeUNvZGUSHAoYQ09VTlRSWV9DT0RFX1VOU1BFQ0lGSUVEEAASEwoPQ09VTlRSWV9DT0RFX1VTEAESEwoPQ09VTlRSWV9DT0RFX0NBEAISEwoPQ09VTlRSWV9DT0RFX0RFEAMSEwoPQ09VTlRSWV9DT0RFX1BMEAQqhQEKD0VzY2FsYXRpb25MZXZlbBIgChxFU0NBTEFUSU9OX0xFVkVMX1VOU1BFQ0lGSUVEEAASGAoURVNDQUxBVElPTl9MRVZFTF9MT1cQARIbChdFU0NBTEFUSU9OX0xFVkVMX01FRElVTRACEhkKFUVTQ0FMQVRJT05fTEVWRUxfSElHSBADKr0BChNOb3RpZmljYXRpb25DaGFubmVsEiQKIE5PVElGSUNBVElPTl9DSEFOTkVMX1VOU1BFQ0lGSUVEEAASHgoaTk9USUZJQ0FUSU9OX0NIQU5ORUxfRU1BSUwQARIcChhOT1RJRklDQVRJT05fQ0hBTk5FTF9TTVMQAhIeChpOT1RJRklDQVRJT05fQ0hBTk5FTF9TTEFDSxADEiIKHk5PVElGSUNBVElPTl9DSEFOTkVMX1BBR0VSRFVUWRAEQk1aS2dpdGh1Yi5jb20vbWFsaW5za2liZW5pYW1pbi9wcm90b2Zvcm0vcHJvdG8vZ2VuL2dvL3Byb3RvZm9ybS92MTtwcm90b2Zvcm12MWIGcHJvdG8z",
    [
      file_protoform_v1_auto_form_ui,
      file_buf_validate_validate,
      file_google_protobuf_any,
      file_google_protobuf_duration,
      file_google_protobuf_field_mask,
      file_google_protobuf_struct,
      file_google_protobuf_timestamp,
      file_google_protobuf_wrappers,
    ]
  );

/**
 * Primary protobuf fixture for AutoForm. It intentionally mixes scalar, nested,
 * repeated, map, oneof, and well-known types so the form generator can exercise
 * the sketchier corners of descriptor-driven rendering.
 *
 * @generated from message protoform.v1.AutoFormExample
 */
export type AutoFormExample = Message<"protoform.v1.AutoFormExample"> & {
  /**
   * Public handle shown in mentions and admin lists.
   *
   * @generated from field: string username = 1;
   */
  username: string;

  /**
   * Main email address for notifications and login recovery.
   *
   * @generated from field: string primary_email = 2;
   */
  primaryEmail: string;

  /**
   * Optional personal or team homepage.
   *
   * @generated from field: string homepage_url = 3;
   */
  homepageUrl: string;

  /**
   * UUID copied from an upstream system.
   *
   * @generated from field: string resource_id = 4;
   */
  resourceId: string;

  /**
   * Free-form summary shown on the profile card.
   *
   * @generated from field: string bio = 5;
   */
  bio: string;

  /**
   * @generated from field: bool is_enabled = 6;
   */
  isEnabled: boolean;

  /**
   * @generated from field: int32 age = 7;
   */
  age: number;

  /**
   * @generated from field: uint32 login_count = 8;
   */
  loginCount: number;

  /**
   * @generated from field: sint32 reputation_delta = 9;
   */
  reputationDelta: number;

  /**
   * @generated from field: int64 employee_number = 10;
   */
  employeeNumber: bigint;

  /**
   * @generated from field: uint64 storage_quota_bytes = 11;
   */
  storageQuotaBytes: bigint;

  /**
   * @generated from field: float profile_score = 12;
   */
  profileScore: number;

  /**
   * @generated from field: double account_balance = 13;
   */
  accountBalance: number;

  /**
   * Optional avatar payload for attachment-based workflows.
   *
   * @generated from field: bytes avatar_bytes = 14;
   */
  avatarBytes: Uint8Array;

  /**
   * @generated from field: protoform.v1.AccessTier access_tier = 15;
   */
  accessTier: AccessTier;

  /**
   * Shipping destination used for hardware deliveries.
   *
   * @generated from field: protoform.v1.Address shipping_address = 16;
   */
  shippingAddress?: Address | undefined;

  /**
   * @generated from field: protoform.v1.Address billing_address = 17;
   */
  billingAddress?: Address | undefined;

  /**
   * @generated from field: optional string nickname = 18;
   */
  nickname?: string | undefined;

  /**
   * @generated from field: google.protobuf.StringValue middle_name = 19;
   */
  middleName?: string | undefined;

  /**
   * @generated from field: google.protobuf.Int32Value bonus_points = 20;
   */
  bonusPoints?: number | undefined;

  /**
   * @generated from field: google.protobuf.BoolValue beta_tester = 21;
   */
  betaTester?: boolean | undefined;

  /**
   * Lightweight labels used for quick filtering.
   *
   * @generated from field: repeated string tags = 22;
   */
  tags: string[];

  /**
   * @generated from field: repeated protoform.v1.Address previous_addresses = 23;
   */
  previousAddresses: Address[];

  /**
   * @generated from field: repeated int32 lucky_numbers = 24;
   */
  luckyNumbers: number[];

  /**
   * Flat metadata pairs for analytics and routing.
   *
   * @generated from field: map<string, string> labels = 25;
   */
  labels: { [key: string]: string };

  /**
   * Named office addresses keyed by a short slug.
   *
   * @generated from field: map<string, protoform.v1.Address> office_locations = 26;
   */
  officeLocations: { [key: string]: Address };

  /**
   * Exactly one preferred contact route can be selected at a time.
   *
   * @generated from oneof protoform.v1.AutoFormExample.preferred_contact
   */
  preferredContact:
    | {
        /**
         * Route updates to an email inbox.
         *
         * @generated from field: string preferred_email = 27;
         */
        value: string;
        case: "preferredEmail";
      }
    | {
        /**
         * Route urgent notices to an E.164 phone number.
         *
         * @generated from field: string preferred_phone = 28;
         */
        value: string;
        case: "preferredPhone";
      }
    | {
        /**
         * Opt out of direct outreach entirely.
         *
         * @generated from field: bool do_not_contact = 29;
         */
        value: boolean;
        case: "doNotContact";
      }
    | { case: undefined; value?: undefined };

  /**
   * Timestamp captured when the record was created.
   *
   * @generated from field: google.protobuf.Timestamp created_at = 30;
   */
  createdAt?: Timestamp | undefined;

  /**
   * @generated from field: google.protobuf.Timestamp expires_at = 31;
   */
  expiresAt?: Timestamp | undefined;

  /**
   * Delay between reminder notifications.
   *
   * @generated from field: google.protobuf.Duration reminder_interval = 32;
   */
  reminderInterval?: Duration | undefined;

  /**
   * Fields the current actor is allowed to update.
   *
   * @generated from field: google.protobuf.FieldMask writable_paths = 33;
   */
  writablePaths?: FieldMask | undefined;

  /**
   * Arbitrary preference flags stored as a JSON-ish struct.
   *
   * @generated from field: google.protobuf.Struct preferences = 34;
   */
  preferences?: JsonObject | undefined;

  /**
   * Generic featured value for experiments and demos.
   *
   * @generated from field: google.protobuf.Value featured_value = 35;
   */
  featuredValue?: Value | undefined;

  /**
   * Ordered dashboard widgets stored as a dynamic list.
   *
   * @generated from field: google.protobuf.ListValue dashboard_blocks = 36;
   */
  dashboardBlocks?: ListValue | undefined;

  /**
   * External Any payload kept intentionally loose for edge-case coverage.
   *
   * @generated from field: google.protobuf.Any external_payload = 37;
   */
  externalPayload?: Any | undefined;

  /**
   * @generated from field: int32 minimum_threshold = 38;
   */
  minimumThreshold: number;

  /**
   * @generated from field: int32 maximum_threshold = 39;
   */
  maximumThreshold: number;

  /**
   * Nested support settings with their own CEL validation rule.
   *
   * @generated from field: protoform.v1.ProfileSettings settings = 40;
   */
  settings?: ProfileSettings | undefined;
};

/**
 * Describes the message protoform.v1.AutoFormExample.
 * Use `create(AutoFormExampleSchema)` to create a new message.
 */
export const AutoFormExampleSchema: GenMessage<AutoFormExample> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 0);

/**
 * Focused protobuf fixture for proto UI metadata and UI CEL demos.
 *
 * @generated from message protoform.v1.AutoFormUiMetadataExample
 */
export type AutoFormUiMetadataExample =
  Message<"protoform.v1.AutoFormUiMetadataExample"> & {
    /**
     * Friendly cluster name shown in rollout summaries.
     *
     * @generated from field: string cluster_name = 1;
     */
    clusterName: string;

    /**
     * Cloud provider where the request will be deployed.
     *
     * @generated from field: protoform.v1.UiDemoProvider provider = 2;
     */
    provider: UiDemoProvider;

    /**
     * Region where the cluster will be created.
     *
     * @generated from field: string region = 3;
     */
    region: string;

    /**
     * Toggle the conditional support step on or off.
     *
     * @generated from field: bool enable_support_mode = 4;
     */
    enableSupportMode: boolean;

    /**
     * Requested support tier for the deployment.
     *
     * @generated from field: protoform.v1.UiDemoSupportTier support_tier = 5;
     */
    supportTier: UiDemoSupportTier;

    /**
     * Requested maintenance window for premium support coordination.
     *
     * @generated from field: google.protobuf.Timestamp maintenance_window = 6;
     */
    maintenanceWindow?: Timestamp | undefined;

    /**
     * Extra context only needed for platinum support requests.
     *
     * @generated from field: string escalation_reason = 7;
     */
    escalationReason: string;

    /**
     * Pick exactly one support contact route once premium support is active.
     *
     * @generated from oneof protoform.v1.AutoFormUiMetadataExample.support_contact
     */
    supportContact:
      | {
          /**
           * Route follow-up through an email inbox.
           *
           * @generated from field: string support_email = 8;
           */
          value: string;
          case: "supportEmail";
        }
      | {
          /**
           * Route follow-up through a Slack channel.
           *
           * @generated from field: string slack_channel = 9;
           */
          value: string;
          case: "slackChannel";
        }
      | {
          /**
           * Explicitly avoid any follow-up contact.
           *
           * @generated from field: bool no_follow_up = 10;
           */
          value: boolean;
          case: "noFollowUp";
        }
      | { case: undefined; value?: undefined };

    /**
     * API token for authenticating with the deployment service.
     *
     * @generated from field: string api_token = 13;
     */
    apiToken: string;

    /**
     * Approval or change-management ticket for the deployment.
     *
     * @generated from field: string approval_ticket = 11;
     */
    approvalTicket: string;

    /**
     * Keep a final dry-run toggle in the deploy section.
     *
     * @generated from field: bool enable_dry_run = 12;
     */
    enableDryRun: boolean;
  };

/**
 * Describes the message protoform.v1.AutoFormUiMetadataExample.
 * Use `create(AutoFormUiMetadataExampleSchema)` to create a new message.
 */
export const AutoFormUiMetadataExampleSchema: GenMessage<AutoFormUiMetadataExample> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 1);

/**
 * Postal address used by several nested object fields and maps.
 *
 * @generated from message protoform.v1.Address
 */
export type Address = Message<"protoform.v1.Address"> & {
  /**
   * @generated from field: string line_one = 1;
   */
  lineOne: string;

  /**
   * @generated from field: string city = 2;
   */
  city: string;

  /**
   * @generated from field: string state = 3;
   */
  state: string;

  /**
   * @generated from field: string postal_code = 4;
   */
  postalCode: string;

  /**
   * @generated from field: protoform.v1.CountryCode country = 5;
   */
  country: CountryCode;

  /**
   * @generated from field: protoform.v1.GeoPoint location = 6;
   */
  location?: GeoPoint | undefined;

  /**
   * @generated from field: optional string line_two = 7;
   */
  lineTwo?: string | undefined;
};

/**
 * Describes the message protoform.v1.Address.
 * Use `create(AddressSchema)` to create a new message.
 */
export const AddressSchema: GenMessage<Address> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 2);

/**
 * Latitude/longitude pair used by the nested Address message.
 *
 * @generated from message protoform.v1.GeoPoint
 */
export type GeoPoint = Message<"protoform.v1.GeoPoint"> & {
  /**
   * @generated from field: double latitude = 1;
   */
  latitude: number;

  /**
   * @generated from field: double longitude = 2;
   */
  longitude: number;
};

/**
 * Describes the message protoform.v1.GeoPoint.
 * Use `create(GeoPointSchema)` to create a new message.
 */
export const GeoPointSchema: GenMessage<GeoPoint> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 3);

/**
 * Support workflow settings nested under the main example message.
 *
 * @generated from message protoform.v1.ProfileSettings
 */
export type ProfileSettings = Message<"protoform.v1.ProfileSettings"> & {
  /**
   * @generated from field: bool enable_support_mode = 1;
   */
  enableSupportMode: boolean;

  /**
   * @generated from field: protoform.v1.EscalationLevel escalation_level = 2;
   */
  escalationLevel: EscalationLevel;

  /**
   * @generated from field: repeated protoform.v1.NotificationChannel notification_channels = 3;
   */
  notificationChannels: NotificationChannel[];

  /**
   * @generated from field: map<string, protoform.v1.NestedSetting> nested_settings = 4;
   */
  nestedSettings: { [key: string]: NestedSetting };
};

/**
 * Describes the message protoform.v1.ProfileSettings.
 * Use `create(ProfileSettingsSchema)` to create a new message.
 */
export const ProfileSettingsSchema: GenMessage<ProfileSettings> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 4);

/**
 * Small nested settings entry used inside a protobuf map.
 *
 * @generated from message protoform.v1.NestedSetting
 */
export type NestedSetting = Message<"protoform.v1.NestedSetting"> & {
  /**
   * @generated from field: string label = 1;
   */
  label: string;

  /**
   * @generated from field: google.protobuf.Timestamp scheduled_for = 2;
   */
  scheduledFor?: Timestamp | undefined;
};

/**
 * Describes the message protoform.v1.NestedSetting.
 * Use `create(NestedSettingSchema)` to create a new message.
 */
export const NestedSettingSchema: GenMessage<NestedSetting> =
  /*@__PURE__*/
  messageDesc(file_protoform_v1_auto_form_example, 5);

/**
 * @generated from enum protoform.v1.AccessTier
 */
export enum AccessTier {
  /**
   * @generated from enum value: ACCESS_TIER_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: ACCESS_TIER_VIEWER = 1;
   */
  VIEWER = 1,

  /**
   * @generated from enum value: ACCESS_TIER_EDITOR = 2;
   */
  EDITOR = 2,

  /**
   * @generated from enum value: ACCESS_TIER_ADMIN = 3;
   */
  ADMIN = 3,
}

/**
 * Describes the enum protoform.v1.AccessTier.
 */
export const AccessTierSchema: GenEnum<AccessTier> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 0);

/**
 * @generated from enum protoform.v1.UiDemoProvider
 */
export enum UiDemoProvider {
  /**
   * @generated from enum value: UI_DEMO_PROVIDER_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: UI_DEMO_PROVIDER_AWS = 1;
   */
  AWS = 1,

  /**
   * @generated from enum value: UI_DEMO_PROVIDER_GCP = 2;
   */
  GCP = 2,

  /**
   * @generated from enum value: UI_DEMO_PROVIDER_AZURE = 3;
   */
  AZURE = 3,
}

/**
 * Describes the enum protoform.v1.UiDemoProvider.
 */
export const UiDemoProviderSchema: GenEnum<UiDemoProvider> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 1);

/**
 * @generated from enum protoform.v1.UiDemoSupportTier
 */
export enum UiDemoSupportTier {
  /**
   * @generated from enum value: UI_DEMO_SUPPORT_TIER_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: UI_DEMO_SUPPORT_TIER_STANDARD = 1;
   */
  STANDARD = 1,

  /**
   * @generated from enum value: UI_DEMO_SUPPORT_TIER_PRIORITY = 2;
   */
  PRIORITY = 2,

  /**
   * @generated from enum value: UI_DEMO_SUPPORT_TIER_PLATINUM = 3;
   */
  PLATINUM = 3,
}

/**
 * Describes the enum protoform.v1.UiDemoSupportTier.
 */
export const UiDemoSupportTierSchema: GenEnum<UiDemoSupportTier> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 2);

/**
 * @generated from enum protoform.v1.CountryCode
 */
export enum CountryCode {
  /**
   * @generated from enum value: COUNTRY_CODE_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: COUNTRY_CODE_US = 1;
   */
  US = 1,

  /**
   * @generated from enum value: COUNTRY_CODE_CA = 2;
   */
  CA = 2,

  /**
   * @generated from enum value: COUNTRY_CODE_DE = 3;
   */
  DE = 3,

  /**
   * @generated from enum value: COUNTRY_CODE_PL = 4;
   */
  PL = 4,
}

/**
 * Describes the enum protoform.v1.CountryCode.
 */
export const CountryCodeSchema: GenEnum<CountryCode> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 3);

/**
 * @generated from enum protoform.v1.EscalationLevel
 */
export enum EscalationLevel {
  /**
   * @generated from enum value: ESCALATION_LEVEL_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: ESCALATION_LEVEL_LOW = 1;
   */
  LOW = 1,

  /**
   * @generated from enum value: ESCALATION_LEVEL_MEDIUM = 2;
   */
  MEDIUM = 2,

  /**
   * @generated from enum value: ESCALATION_LEVEL_HIGH = 3;
   */
  HIGH = 3,
}

/**
 * Describes the enum protoform.v1.EscalationLevel.
 */
export const EscalationLevelSchema: GenEnum<EscalationLevel> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 4);

/**
 * @generated from enum protoform.v1.NotificationChannel
 */
export enum NotificationChannel {
  /**
   * @generated from enum value: NOTIFICATION_CHANNEL_UNSPECIFIED = 0;
   */
  UNSPECIFIED = 0,

  /**
   * @generated from enum value: NOTIFICATION_CHANNEL_EMAIL = 1;
   */
  EMAIL = 1,

  /**
   * @generated from enum value: NOTIFICATION_CHANNEL_SMS = 2;
   */
  SMS = 2,

  /**
   * @generated from enum value: NOTIFICATION_CHANNEL_SLACK = 3;
   */
  SLACK = 3,

  /**
   * @generated from enum value: NOTIFICATION_CHANNEL_PAGERDUTY = 4;
   */
  PAGERDUTY = 4,
}

/**
 * Describes the enum protoform.v1.NotificationChannel.
 */
export const NotificationChannelSchema: GenEnum<NotificationChannel> =
  /*@__PURE__*/
  enumDesc(file_protoform_v1_auto_form_example, 5);

; Scope permissions to installed runtime files, even for a custom install path.
; Never recursively grant access to the installation directory or user records.
!macro GrantRuntimeRead relativePath
  nsExec::ExecToStack '"$SYSDIR\icacls.exe" "$INSTDIR\${relativePath}" /grant *S-1-15-2-1:(RX) /C /Q'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "Could not apply sandbox read permissions for ${relativePath}: $0"
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro GrantRuntimeRead "${APP_EXECUTABLE_FILENAME}"
  !insertmacro GrantRuntimeRead "icudtl.dat"
  !insertmacro GrantRuntimeRead "*.dll"
  !insertmacro GrantRuntimeRead "*.pak"
  !insertmacro GrantRuntimeRead "snapshot_blob.bin"
  !insertmacro GrantRuntimeRead "v8_context_snapshot.bin"
  !insertmacro GrantRuntimeRead "vk_swiftshader_icd.json"
  !insertmacro GrantRuntimeRead "locales\*.pak"
  !insertmacro GrantRuntimeRead "resources\app.asar"
!macroend

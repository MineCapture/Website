(vl-load-com)
(defun tsa-cc:safe (obj prop / r)
  (setq r (vl-catch-all-apply 'vlax-get-property (list obj prop)))
  (if (vl-catch-all-error-p r) (strcat "<unavailable: " (vl-catch-all-error-message r) ">") (vl-prin1-to-string r)))
(defun tsa-cc:write (f key value)
  (write-line (strcat key " = " value) f))
(defun tsa-cc:dump (f en / ed d)
  (if en
    (progn
      (setq ed (entget en))
      (foreach d ed
        (tsa-cc:write f (itoa (car d)) (vl-prin1-to-string (cdr d)))))))
(defun tsa-cc:block (f hand / en ob nm def ent a attrs result)
  (write-line "----------------------------------------" f)
  (tsa-cc:write f "PARENT HANDLE" hand)
  (setq en (handent hand))
  (if (null en)
    (write-line "Not found (verify drawing and handle)" f)
    (progn
      (tsa-cc:dump f en)
      (setq ob (vlax-ename->vla-object en))
      (foreach p '(ObjectName Name EffectiveName InsertionPoint Rotation XScaleFactor YScaleFactor ZScaleFactor Normal HasAttributes IsDynamicBlock)
        (tsa-cc:write f (strcat "ActiveX " (vl-prin1-to-string p)) (tsa-cc:safe ob p)))
      (setq result (vl-catch-all-apply 'vlax-invoke-method (list ob 'GetAttributes)))
      (if (not (vl-catch-all-error-p result))
        (progn
          (if (= (type result) 'VARIANT) (setq result (vlax-variant-value result)))
          (if (= (type result) 'SAFEARRAY) (setq result (vlax-safearray->list result)))
          (if (listp result)
            (foreach a result
              (tsa-cc:write f "ATTRIBUTE TAG" (tsa-cc:safe a 'TagString))
              (tsa-cc:write f "ATTRIBUTE TEXT" (tsa-cc:safe a 'TextString))
              (tsa-cc:write f "ATTRIBUTE INSERTION" (tsa-cc:safe a 'InsertionPoint))))))
      (setq nm (vl-catch-all-apply 'vla-get-name (list ob)))
      (if (not (vl-catch-all-error-p nm))
        (progn
          (setq def (tblobjname "BLOCK" nm))
          (if def
            (progn
              (tsa-cc:write f "BLOCK DEFINITION" nm)
              (setq ent (entnext def))
              (while (and ent (/= (cdr (assoc 0 (entget ent))) "ENDBLK"))
                (write-line "  ---- child ----" f)
                (tsa-cc:dump f ent)
                (setq ent (entnext ent))))))))))
(defun TSA_CROSSCUT_DIAG (/ path f)
  (setq path (getfiled "Save cross-cut block diagnostic" "C:\\Temp\\tsa_crosscut_blocks.txt" "txt" 1))
  (if path
    (progn
      (setq f (open path "w"))
      (if f
        (progn
          (tsa-cc:write f "DRAWING" (getvar "DWGNAME"))
          (tsa-cc:write f "UCS NAME" (getvar "UCSNAME"))
          (tsa-cc:write f "UCS ORIGIN" (vl-prin1-to-string (getvar "UCSORG")))
          (tsa-cc:write f "UCS XDIR" (vl-prin1-to-string (getvar "UCSXDIR")))
          (tsa-cc:write f "UCS YDIR" (vl-prin1-to-string (getvar "UCSYDIR")))
          (foreach h '("5C3AA" "5C3AE" "5C3B2" "5C3B6" "5C3BA" "5C3BE" "5C3C2" "5C3C6" "116139" "11613D")
            (tsa-cc:block f h))
          (close f)
          (princ (strcat "\nSaved " path)))
        (princ "\nCannot create diagnostic file."))))
  (princ))
(defun c:TSA_CROSSCUT_DIAG () (TSA_CROSSCUT_DIAG))
(princ "\nCross-cut block diagnostic loaded. Run TSA_CROSSCUT_DIAG.")
(princ)
